"""Machine à états d'un tour de parole — PUR (aucun I/O, aucun modèle, aucun asyncio).

Pourquoi ce module existe
-------------------------
Le barge-in (« l'usager coupe l'agent ») était déclaré dans le front et
câblé dans `main.py`, mais **impossible** : l'ancien code posait un
`asyncio.Event` que seule la boucle de publication d'audioconsultait, si bien
qu'une réponse déjà partie ne pouvait jamais être arrêtée, et qu'une réponse
calculée après l'interruption était malgré tout dite à voix haute.

Cette classe rend la règle explicite et testable :

    Un tour est identifié par un `turnId` croissant. Toute réponse portant un
    `turnId` inférieur au dernier tour *annulé* est un tour mort : elle ne doit
    plus être ni publiée, ni envoyée au client.

Fournisseurs injectés (ASR, TTS, calcul du tour) : cette classe ne connaît ni
Kiriku, ni xTTS, ni GLM, ni LiveKit. Les tests la couvrent entièrement sans GPU.
"""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field

from agent.voice import protocol

#: Signatures des fournisseurs (toutes bloquantes : le worker les exécute dans
#: un thread, cette classe ne le gère pas — c'est le rôle de `main.py`).
Transcriber = Callable[[bytes], str]
TurnFn = Callable[[str], "str | tuple[str, object]"]
Synthesizer = Callable[[object], bytes]


class _Superseded(Exception):
    """Levée en interne quand un tour a été interrompu par un barge-in."""


@dataclass
class VoiceSession:
    """État d'une session vocale : buffering, tours, barge-in.

    `documents_provider` renvoie l'état réel du dossier au moment du tour — le
    serveur reste la source de vérité (G3) ; la session ne détient aucun état
    métier, seulement de la volatile de conversation.
    """

    transcribe: Transcriber
    turn: TurnFn
    synthesize: Synthesizer
    documents_provider: Callable[[], list] = field(default_factory=list)
    #: Tour courant ; un tour plus ancien est mort (barge-in).
    current_turn: str | None = None
    #: Transcript de l'usager en cours de montage (VAD segmenté côté client).
    _buffer: list[bytes] = field(default_factory=list, repr=False)
    #: Segments reçus mais pas encore traités (l'ASR est lent : on n'en perd pas).
    _pending: list[bytes] = field(default_factory=list, repr=False)
    #: Transcriptes déjà traités (affichage + traçabilité).
    history: list[dict] = field(default_factory=list)

    # ── Buffer audio (côté capture) ────────────────────────────────────────
    def push_audio(self, frame_pcm: bytes) -> None:
        """Ajoute une trame de micro (PCM 16 bits 48 kHz) au segment courant."""
        if frame_pcm:
            self._buffer.append(frame_pcm)

    @property
    def buffered_frames(self) -> int:
        return len(self._buffer)

    def flush_segment(self) -> bytes | None:
        """Clôt le segment courant (fin de parole VAD) et rend son PCM.

        Rend None si le segment est vide : on ne lance pas d'ASR sur du silence.
        """
        if not self._buffer:
            return None
        pcm = b"".join(self._buffer)
        self._buffer.clear()
        return pcm or None

    def discard_segment(self) -> int:
        """Jette le segment en cours (barge-in : l'audio déjà capturé est périmé)."""
        dropped = len(self._buffer)
        self._buffer.clear()
        return dropped

    # ── Barge-in ───────────────────────────────────────────────────────────
    def interrupt(self) -> str | None:
        """L'usager reparle : tout tour en cours devient mort, audio capturé jeté.

        Rend le `turnId` abandonné (pour le log), ou None si aucun tour ne
        tournait. C'est le cœur de la correction : `current_turn` passe à
        `None`, donc `is_superseded` devient vrai pour TOUT tour en cours. Une
        réponse déjà partie ne peut plus l'être (la publication s'arrête), et
        une réponse encore en calcul est rejetée à son prochain point de contrôle.
        """
        abandoned = self.current_turn
        self.current_turn = None
        self.discard_segment()
        return abandoned

    def is_superseded(self, turn_id: str | None) -> bool:
        """Un `turnId` est-il mort ? (`None` = tour inconnu, donc mort)"""
        if turn_id is None:
            return True
        if self.current_turn is None:
            return True  # aucun tour vivant : tout ce qui traîne est périmé
        return _turn_index(turn_id) < _turn_index(self.current_turn)

    # ── Un tour ────────────────────────────────────────────────────────────
    def enqueue_segment(self, pcm: bytes) -> str:
        """Met un segment en file d'attente et lui attribue un `turnId`."""
        turn_id = protocol.new_turn_id()
        # Un nouveau tour invalide tous les tours plus anciens.
        self.current_turn = turn_id
        self._pending.append(pcm)
        return turn_id

    def next_pending(self) -> bytes | None:
        return self._pending.pop(0) if self._pending else None

    @property
    def pending_count(self) -> int:
        return len(self._pending)

    def handle_turn(self, wav: bytes, turn_id: str) -> dict:
        """Exécute un tour complet et rend `{events, audio, text, reply}`.

        `events` est une liste ORDONNÉE de ce que le client doit recevoir dans
        l'ordre. Elle se remplit même quand la suite échoue : l'usager voit sa
        transcription et la vraie réponse de texte même sans voix, au lieu d'un
        silence total.

        Rend un `agent_error` explicite si un fournisseur est indisponible
        (dégradé honnête : le front bascule en texte) — jamais une phrase
        inventée pour faire semblant.

        Lève `_Superseded` si le tour a été interrompu pendant son calcul : dans
        ce cas rien ne doit être dit à voix haute.
        """
        self._check_alive(turn_id)
        events: list[dict] = []

        # 1. ASR — le transcript est utile même si la suite échoue.
        try:
            text = self.transcribe(wav)
        except Exception as exc:  # fournisseur indisponible / erreur réseau
            if self.is_superseded(turn_id):
                raise _Superseded(turn_id) from exc
            events.append(protocol.agent_error(
                _code_for(exc), str(exc) or "transcription indisponible", turn_id,
            ))
            return {"events": events, "audio": None, "text": "", "reply": ""}
        self._check_alive(turn_id)
        self.history.append({"turnId": turn_id, "role": "user", "text": text})
        # Le transcript est renvoyé nettoyé : l'ASR laisse des espaces parasites, et
        # le client afficherait des blancs. On ne tronque jamais le fond.
        events.append(protocol.agent_text(
            text.strip(), turn_id, final=True, role=protocol.ROLE_USER,
        ))

        if not text.strip():
            # Segment silencieux reconnu : on le dit honnêtement, sans inventer.
            return {"events": events, "audio": None, "text": text, "reply": ""}

        # 2. Tour de conversation — intent + journey + formulation.
        try:
            out = self.turn(text)
        except Exception as exc:
            if self.is_superseded(turn_id):
                raise _Superseded(turn_id) from exc
            events.append(protocol.agent_error(protocol.ERR_TURN_FAILED, str(exc), turn_id))
            return {"events": events, "audio": None, "text": text, "reply": ""}
        self._check_alive(turn_id)
        # Un tour peut rendre (texte affiché, contenu à dire) : l'écran montre le
        # français, la voix dit le wolof. Une simple chaîne sert aux deux.
        reply, speech = out if isinstance(out, tuple) else (out, out)
        self.history.append({"turnId": turn_id, "role": "agent", "text": reply})

        # 3. TTS — WAV réel. On envoie le texte AVANT de synthétiser : l'usager
        #    attend une réponse, pas un chargement.
        events.append(protocol.agent_text(reply, turn_id, final=True, role=protocol.ROLE_AGENT))
        try:
            wav_out = self.synthesize(speech)
        except Exception as exc:
            if self.is_superseded(turn_id):
                raise _Superseded(turn_id) from exc
            # Pas de voix, mais la réponse texte est réelle : on l'a déjà envoyée.
            events.append(protocol.agent_error(
                _code_for(exc), str(exc) or "voix indisponible", turn_id,
            ))
            return {"events": events, "audio": None, "text": text, "reply": reply}
        self._check_alive(turn_id)

        return {"events": events, "audio": wav_out, "text": text, "reply": reply}

    def _check_alive(self, turn_id: str) -> None:
        if self.is_superseded(turn_id):
            raise _Superseded(turn_id)


def _turn_index(turn_id: str) -> int:
    """`t12` → 12. Un identifiant non numérique est traité comme 0 (mort)."""
    try:
        return int(str(turn_id).lstrip("t"))
    except ValueError:
        return 0


def _code_for(exc: Exception) -> str:
    """Classe l'échec d'un fournisseur en code d'erreur stable pour le client."""
    name = type(exc).__name__.lower()
    if "asr" in name or "kiriku" in name or "transcri" in name:
        return protocol.ERR_ASR_UNAVAILABLE
    if "tts" in name or "xtts" in name or "synth" in name:
        return protocol.ERR_TTS_UNAVAILABLE
    return protocol.ERR_TURN_FAILED
