"""Agent LiveKit — la boucle vocale réelle (ADR-004/005).

Flux (tout réel, zéro contenu pré-écrit) :
  client (VAD Silero) ──DataChannel──► ce worker
      user_segment / barge_in / cancel
  audio micro ──► ASR Kiriku (wolof) ──► orchestrateur (intent → Journey → formulation)
      ──► xTTS wolof ──► track audio publiée dans la room (voix IA réelle).

Ce fichier est un **adaptateur LiveKit mince**. Toute la logique testable
(rééchantillonnage, découpe en trames, protocole, barge-in) vit dans
`agent.voice.audio`, `agent.voice.protocol` et `agent.voice.session`, qui sont
purs et couverts par `tests/matrix/test_voice_loop.py`. C'est délibéré : avant,
100 % de cette logique vivait ici, derrière `import numpy` / `import
livekit.agents`, donc le module ne pouvait pas être importé sur une machine sans
GPU et la logique vocale n'était couverte par AUCUN test.

Trois erreurs structurelles corrigées ici :
  1. **Dossier inconnu du nom de la room.** L'ancien code lisait
     `os.getenv("LIVEKIT_ROOM", "sama-demo")` et chargeait la procédure
     « sama-demo » → `KeyError`. Le dossier est désormais décodé du nom de la
     room (convention réversible de `agent.domain.naming`), et une room
     inconnue est refusée **proprement**, avec un code d'erreur envoyé au client.
  2. **Audio micro jamais reçu.** L'ancien code itérait
     `room.remote_participants` une seule fois, au moment de l'entrée : un
     client qui rejoint la room plus tard n'était jamais écouté, et un track non
     publié renvoyait `None` (AttributeError sur `None.on`). On s'abonne à
     l'événement `track_subscribed`, qui couvre l'arrivée tardive, et on
     démarre explicitement le routage audio de la room.
  3. **Appels bloquants sur la boucle d'événements.** ASR, calcul du tour et TTS
     sont synchrones et lourds (secondes). Sur la boucle asyncio, ils gelaient
     la room entière — donc le barge-in ne pouvait pas arriver pendant un calcul.
     Ils passent désormais par `asyncio.to_thread`, et le barge-in les annule.
"""
from __future__ import annotations

import asyncio
import logging
import os

from agent import bootstrap  # noqa: F401  (met sys.path avant les imports agent)
from agent.domain.naming import journey_id_of
from agent.voice import audio, protocol
from agent.voice.endpoint import END, START, Endpointer
from agent.voice.session import VoiceSession, _Superseded

log = logging.getLogger("sama.worker.voice")
logging.basicConfig(level=logging.INFO)

# ── Dépendances lourdes : échec EXPLICITE et actionnable, pas un ModuleNotFoundError
_MISSING_HINT = """\
La boucle vocale réelle requiert le SDK agent LiveKit et ses dépendances lourdes.

    pip install "livekit-agents>=1.0" "livekit>=1.8" numpy

Le CPU (ASR Kiriku / TTS xTTS) s'installe séparément, car il pèse plusieurs Go :
    pip install torch transformers TTS

Sans ces paquets, le reste du produit fonctionne : API HTTP, moteur de parcours,
analyse de documents, tests. Seule la session vocale est indisponible, et le
front bascule alors en saisie texte (dégradé honnête, jamais de fausse voix).
"""
try:
    from livekit import rtc
    from livekit.agents import JobContext, JobExecutorType, WorkerOptions, cli
except ImportError as exc:  # pragma: no cover - depend du poste de dev
    raise ImportError(f"{_MISSING_HINT}\nCause initiale : {exc}") from exc

# Les fournisseurs STT/TTS sont importés tardivement : ils ne sont utiles qu'une
# fois la room connectée, et ils lèvent eux-mêmes une erreur lisible en mode
# déterministe (le front bascule alors en texte).
from agent.application.orchestration.agent_orchestrator import voice_turn
from agent.infrastructure.stt import asr_kiriku
from agent.infrastructure.tts import stream_reply as tts_stream_reply
from agent.infrastructure.tts import tts_wolof

#: Borne mémoire explicite : segment de 30 s en PCM mono 48 kHz / 16 bits.
MAX_BUFFERED_AUDIO_SECONDS = 30
MAX_BUFFERED_AUDIO_BYTES = audio.MIC_SAMPLE_RATE * 2 * MAX_BUFFERED_AUDIO_SECONDS


class VoiceRuntime:
    """Une session vocale : capture, tours, publication, barge-in."""

    def __init__(self, ctx: JobContext, journey_id: str) -> None:
        self.ctx = ctx
        self.room = ctx.room
        self.journey_id = journey_id
        self.speaker = os.getenv("XTTS_SPEAKER", "")
        self.session = VoiceSession(
            transcribe=self._transcribe,
            turn=self._turn,
            synthesize=self._synthesize,
        )
        #: Publication audio en cours (réf. pour pouvoir l'interrompre).
        self._track = None
        self._source = None
        self._stop = asyncio.Event()
        self._lock = asyncio.Lock()
        self._audio_tasks: dict[str, asyncio.Task[None]] = {}
        # Volume du segment en cours, borné en octets plutôt qu'en trames.
        self._buffered = 0
        self._buffered_bytes = 0
        self._audio_limit_hit = False
        # Détection de parole côté serveur (voir agent.voice.endpoint).
        self.endpointer = Endpointer(sample_rate=audio.MIC_SAMPLE_RATE)
        self._speaking = False

    # ── Fournisseurs (bloquants : toujours appelés via to_thread) ──────────
    def _transcribe(self, wav: bytes) -> str:
        return asr_kiriku.transcribe(wav)

    def _turn(self, text: str):
        # Le dossier est relu en base à chaque tour (G3 : jamais une copie en mémoire).
        # Réponse LIBRE du LLM, avec l'historique de la session (sans le tour courant,
        # déjà ajouté par la session). Rend (texte affiché, réponse complète à dire).
        history = [h for h in self.session.history if h.get("text")][:-1]
        reply = voice_turn(text, self.journey_id, history=history)
        # À l'écran : le WOLOF d'abord (ce que l'agent dit), la traduction dessous.
        shown = f"{reply.spoken}\n\n{reply.display}" if reply.spoken else reply.display
        return shown, reply

    def _synthesize(self, reply):
        """Voix réelle, PHRASE PAR PHRASE : générateur paresseux de WAV (aucun
        calcul ici — la synthèse avance pendant la lecture, dans _speak)."""
        def _stream():
            for i, (wav, lang) in enumerate(
                tts_stream_reply(reply.display, reply.spoken, speaker_wav=self.speaker)
            ):
                if i == 0:
                    log.info("voix de l'agent : %s", "wolof (Adia)" if lang == "wo" else "français (repli)")
                yield wav
        return _stream()

    # ── Canal de données ───────────────────────────────────────────────────
    async def send(self, event: dict) -> None:
        """Émet un événement vers le client (jamais bloquant, jamais fatal)."""
        try:
            await self.room.local_participant.publish_data(
                protocol.encode(event), reliable=True,
            )
        except Exception as exc:  # le client est parti, la room se ferme…
            log.debug("envoi client impossible (%s) : %s", event.get("type"), exc)

    # ── Capture audio ──────────────────────────────────────────────────────
    def on_audio_frame(self, frame) -> None:
        """Callback `audio_frame` : empile le PCM du segment en cours.

        Ne fait QUE de l'empilement — c'est une garantie de non-blocage pour le
        thread média de LiveKit. La conversion WAV/16 k a lieu au flush.
        """
        pcm = bytes(frame.data)
        event = self.endpointer.feed(pcm, strict=self._speaking)
        if event is None:
            return
        kind, utterance = event
        if kind == START:
            log.info("parole détectée (seuil %.0f)", self.endpointer.threshold())
            if self._speaking or self.session.current_turn is not None:
                # Barge-in : l'usager coupe l'agent (réponse en cours abandonnée).
                abandoned = self.session.interrupt()
                if self._speaking:
                    self._stop.set()  # coupe la voix de l'agent
                log.info("barge-in : tour %s abandonné", abandoned)
            asyncio.create_task(self.send(protocol.agent_state(protocol.ST_LISTENING)))
        elif kind == END:
            log.info("fin d'énoncé : %.1f s d'audio", len(utterance) / 2 / audio.MIC_SAMPLE_RATE)
            asyncio.create_task(self.flush_segment(utterance))

    async def _read_audio_track(self, track) -> None:
        """Consomme les trames d'un track distant via l'API LiveKit AudioStream."""
        stream = rtc.AudioStream(
            track=track,
            sample_rate=audio.MIC_SAMPLE_RATE,
            num_channels=1,
            capacity=50,
        )
        try:
            async for event in stream:
                self.on_audio_frame(event.frame)
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("lecture du track audio interrompue : %s", getattr(track, "sid", "unknown"))
        finally:
            await stream.aclose()

    def _watch_audio_track(self, track, publication) -> None:
        if track.kind != rtc.TrackKind.KIND_AUDIO:
            return
        track_sid = getattr(track, "sid", None) or publication.sid
        active = self._audio_tasks.get(track_sid)
        if active is not None and not active.done():
            return
        log.info("micro abonné : %s", publication.name)
        self._audio_tasks[track_sid] = asyncio.create_task(self._read_audio_track(track))

    async def flush_segment(self, pcm: bytes | None = None) -> None:
        """Fin d'énoncé : WAV → ASR → tour → publication. Chaîne réelle."""
        pcm_48k = pcm if pcm is not None else self.session.flush_segment()
        self._buffered = 0
        self._buffered_bytes = 0
        limit_hit = self._audio_limit_hit
        self._audio_limit_hit = False
        if limit_hit:
            await self.send(protocol.agent_error(
                protocol.ERR_TURN_FAILED,
                f"segment audio supérieur à {MAX_BUFFERED_AUDIO_SECONDS} secondes",
            ))
            return
        if not pcm_48k:
            return
        wav = await asyncio.to_thread(audio.mic_frames_to_wav, [pcm_48k], audio.MIC_SAMPLE_RATE)
        if not wav:
            return

        turn_id = self.session.enqueue_segment(wav)
        await self.send(protocol.agent_state(protocol.ST_THINKING, turn_id))
        try:
            result = await asyncio.to_thread(self.session.handle_turn, wav, turn_id)
        except _Superseded:
            # Barge-in : ce tour est mort, on ne dit rien (pas même « listening »).
            log.info("tour %s abandonne (barge-in)", turn_id)
            return

        # Transcription puis réponse, dans l'ordre — même si la voix, elle, échoue.
        for event in result["events"]:
            await self.send(event)
        if result["audio"] is None:
            await self.send(protocol.agent_state(protocol.ST_LISTENING, turn_id))
            return

        # Le barge-in peut être arrivé pendant la synthèse : on ne parle plus.
        if self.session.is_superseded(turn_id):
            log.info("tour %s abandonne avant publication (barge-in)", turn_id)
            return

        await self._speak(result["audio"], turn_id)

    async def _speak(self, speech, turn_id: str) -> None:
        """Dit la réponse : un WAV, ou un flux de WAV (une phrase chacun).

        La première phrase est attendue AVANT d'annoncer « speaking » : une panne
        de voix devient une erreur honnête, jamais un faux état « je parle ».
        """
        segments = iter([speech]) if isinstance(speech, (bytes, bytearray)) else iter(speech)
        try:
            first = await asyncio.to_thread(next, segments, None)
        except Exception as exc:
            log.warning("voix indisponible : %s", exc)
            await self.send(protocol.agent_error(protocol.ERR_TTS_UNAVAILABLE, str(exc), turn_id))
            await self.send(protocol.agent_state(protocol.ST_LISTENING, turn_id))
            return
        if first is None or self.session.is_superseded(turn_id):
            if first is None:
                await self.send(protocol.agent_state(protocol.ST_LISTENING, turn_id))
            return
        await self.send(protocol.agent_state(protocol.ST_SPEAKING, turn_id))
        self._stop.clear()  # un ancien « stop » ne doit pas couper cette réponse
        self._speaking = True
        try:
            await self._publish(first, turn_id, rest=segments)
        finally:
            self._speaking = False
        if not self.session.is_superseded(turn_id):
            await self.send(protocol.agent_state(protocol.ST_LISTENING, turn_id))

    @staticmethod
    def _next_or_none(segments):
        """Phrase suivante ; None en fin de flux OU sur panne en cours de réponse
        (le texte est déjà affiché : la voix s'arrête là, sans inventer)."""
        try:
            return next(segments, None)
        except Exception:
            log.warning("voix interrompue en cours de réponse", exc_info=True)
            return None

    async def _publish(self, wav: bytes, turn_id: str, rest=None) -> None:
        """Publie la réponse sur UN track, phrase après phrase, en respectant le
        barge-in. La phrase suivante se synthétise PENDANT la lecture de la
        courante (prélecture dans un thread)."""
        source = rtc.AudioSource(sample_rate=audio.TTS_SAMPLE_RATE, num_channels=1)
        track = rtc.LocalAudioTrack.create_audio_track("agent-voice", source)
        pub = await self.room.local_participant.publish_track(
            track, rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_MICROPHONE)
        )
        self._source, self._track = source, pub
        interrupted = False
        current: bytes | None = wav
        try:
            while current is not None and not interrupted:
                prefetch = (
                    asyncio.ensure_future(asyncio.to_thread(self._next_or_none, rest))
                    if rest is not None else None
                )
                try:
                    chunks = await asyncio.to_thread(
                        audio.wav_to_chunks, current, audio.TTS_SAMPLE_RATE, 100)
                except audio.AudioFormatError as exc:
                    # Format inattendu : la réponse texte est déjà partie, on le signale.
                    await self.send(protocol.agent_error(protocol.ERR_TURN_FAILED, str(exc), turn_id))
                    chunks = []
                for chunk in chunks:
                    if self._stop.is_set() or self.session.is_superseded(turn_id):
                        interrupted = True
                        break
                    await source.capture_frame(
                        rtc.AudioFrame(
                            data=chunk.data,
                            sample_rate=chunk.sample_rate,
                            num_channels=chunk.num_channels,
                            samples_per_channel=chunk.samples_per_channel,
                        )
                    )
                    # Rythme réel : 100 ms d'audio par trame.
                    await asyncio.sleep(0.1)
                current = await prefetch if (prefetch is not None and not interrupted) else None
            if interrupted:
                # Barge-in : l'audio déjà en file (jusqu'à 1 s) ne doit plus sortir.
                source.clear_queue()
            else:
                # Sinon on laisse finir la phrase avant de dépublier le track.
                await source.wait_for_playout()
        finally:
            self._stop.clear()
            self._source = None
            self._track = None
            await source.aclose()
            try:
                await self.room.local_participant.unpublish_track(pub.sid)
            except RuntimeError:
                pass  # la room s'est fermée entre-temps : rien à publier de toute façon

    # ── Abonnements ────────────────────────────────────────────────────────
    async def attach(self) -> None:
        """S'abonne à la room : tracks, data, départs, participants tardifs."""
        self.room.on("data_received", self._on_data)

        @self.room.on("track_subscribed")
        def _on_track(track, publication, participant):  # noqa: ANN001
            """Un track micro vient d'être publié — y compris pour un client
            arrivé APRÈS notre entrée (le cas que l'ancien code ignorait)."""
            self._watch_audio_track(track, publication)

        @self.room.on("track_unsubscribed")
        def _on_track_unsubscribed(track, publication, participant):  # noqa: ANN001
            track_sid = getattr(track, "sid", None) or publication.sid
            task = self._audio_tasks.pop(track_sid, None)
            if task is not None:
                task.cancel()

        @self.room.on("participant_disconnected")
        def _on_leave(participant):  # noqa: ANN001
            log.info("participant parti : %s", participant.identity)

        # L'agent peut entrer après le navigateur : traiter aussi les tracks déjà
        # souscrits, pas seulement les futurs événements track_subscribed.
        for participant in self.room.remote_participants.values():
            for publication in participant.track_publications.values():
                track = publication.track
                if publication.subscribed and track is not None:
                    self._watch_audio_track(track, publication)

    def _on_data(self, data, *_args) -> None:
        """Traite un événement client. Jamais d'exception : on ne tue pas la room."""
        event = protocol.decode(data.data if hasattr(data, "data") else data)
        if not event:
            return
        kind = event.get("type")
        if kind in (protocol.EV_USER_SEGMENT, protocol.EV_BARGE_IN):
            # Le serveur détecte lui-même début/fin de parole : les indices d'un
            # VAD navigateur (anciens clients) sont ignorés pour ne pas couper un
            # énoncé en deux.
            return
        if kind == protocol.EV_CANCEL:
            abandoned = self.session.interrupt()
            self._buffered = 0
            self._buffered_bytes = 0
            self._audio_limit_hit = False
            self._stop.set()  # arrête la publication audio en cours
            log.info("barge-in : tour %s abandonné", abandoned)

    async def run(self) -> None:
        """Boucle de vie : diffusion de l'audio micro + attente des événements."""
        await self.send(protocol.agent_state(protocol.ST_LISTENING))
        # Le job se termine quand la room se vide ou qu'on est déconnecté.
        try:
            while self.room.isconnected():
                await asyncio.sleep(0.5)
        finally:
            tasks = tuple(self._audio_tasks.values())
            self._audio_tasks.clear()
            for task in tasks:
                task.cancel()
            if tasks:
                await asyncio.gather(*tasks, return_exceptions=True)


async def entrypoint(ctx: JobContext) -> None:
    """Point d'entrée du worker : on déduit le dossier, on branche la session."""
    await ctx.connect()
    room = ctx.room
    log.info("Room jointe : %s", room.name)

    # ── B3 : le dossier vient du NOM de la room, plus d'une variable d'env ──
    journey_id = journey_id_of(room.name)
    if not journey_id:
        # Room inconnue : on le dit au client et on sort proprement. L'ancien
        # code essayait de charger la procédure « sama-demo » → KeyError.
        log.error("room non reconnue : %r (préfixe attendu « %s »)", room.name, "sama-")
        try:
            await room.local_participant.publish_data(
                protocol.encode(protocol.agent_error(
                    protocol.ERR_UNKNOWN_ROOM,
                    f"room non reconnue : {room.name}",
                )),
                reliable=True,
            )
        except Exception:
            pass
        await room.disconnect()
        return

    runtime = VoiceRuntime(ctx, journey_id)
    await runtime.attach()
    try:
        await runtime.run()
    except Exception:
        log.exception("session vocale interrompue")
        await room.disconnect()
        raise


def worker_options() -> WorkerOptions:
    """Options du worker LiveKit, réglées pour un modèle ASR lourd sur GPU.

    - THREAD (et non PROCESS, défaut du SDK) : les sessions partagent le process,
      donc UN seul Kiriku (~10 Go de VRAM) chargé une fois. En PROCESS, chaque
      session rechargeait le modèle (premier tour très lent, VRAM épuisée).
    - load_threshold : le SDK refuse les sessions au-delà de 70 % de charge CPU
      en production ; l'inférence ASR dépasse ce seuil en pointe.
    """
    return WorkerOptions(
        entrypoint_fnc=entrypoint,
        job_executor_type=JobExecutorType.THREAD,
        load_threshold=float(os.getenv("VOICE_LOAD_THRESHOLD", "0.95")),
    )


def app_mode_is_live() -> bool:
    from agent import mode as app_mode

    return app_mode.is_live()


def _warm_models() -> None:
    """Préchauffe Kiriku au démarrage : le premier tour vocal n'attend pas le
    téléchargement ni le chargement du modèle. Une panne est journalisée, jamais
    fatale (l'agent renverra alors une erreur ASR honnête au client)."""
    try:
        asr_kiriku.warm()
        log.info("Kiriku chargé — ASR prêt")
    except Exception:
        log.exception("préchauffage Kiriku impossible")
    if app_mode_is_live():
        tts_wolof.warm()


if __name__ == "__main__":
    import threading

    threading.Thread(target=_warm_models, name="kiriku-warmup", daemon=True).start()
    cli.run_app(worker_options())
