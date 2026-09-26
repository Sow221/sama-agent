"""TTS (infrastructure) — résolveur de fournisseurs réels.

Chaîne de résolution (`SAMA_TTS_BACKEND` = auto | xtts | edge | sapi | off) :
  1. auto  → xTTS si configuré explicitement (XTTS_MODEL/XTTS_CHECKPOINT), sinon Edge
             (voix neuronale française en ligne), sinon SAPI (native Windows, offline).
  2. xtts  → uniquement galsenai/xTTS-v2-wolof (bloqué réellement : pas de poids sur
             le HF repo ni de serveur Coqui en vie — levé en XttsUnavailableError).
  3. edge  → Microsoft Edge neural (edge-tts + miniaudio), WAV 24 kHz.
  4. sapi  → synthèse native Windows (offline, voix David/Zira si pas de française).
  5. off   → jamais de voix : le tour texte passe tel quel (dégradé honnête).

Toute panne d'un backend est levée en XttsUnavailableError et le SUIVANT est tenté ;
si tous échouent, l'erreur finale remonte — le worker vocal envoie alors
agent_error et le front bascule en saisie texte. Aucune voix fabriquée, aucun
silence pré-enregistré : seul du vrai audio de synthèse est publié.
"""
from __future__ import annotations

import os

from agent.infrastructure.tts.tts_xtts import (
    XttsUnavailableError,
    _LazyXtTS,
)

BACKENDS = ("xtts", "edge", "sapi")


def _backend_order() -> list[str]:
    mode = os.getenv("SAMA_TTS_BACKEND", "auto").strip().lower()
    if mode == "off":
        return []
    if mode in BACKENDS:
        return [mode]
    # auto : xTTS seulement s'il est explicitement configuré (sinon échec sûr inutile).
    order = list(BACKENDS)
    xtts_configured = bool(os.getenv("XTTS_MODEL") or os.getenv("XTTS_CHECKPOINT"))
    if not xtts_configured:
        order.remove("xtts")
    return order


_xtts = _LazyXtTS()


def _synth_xtts(text: str, speaker: str | None) -> bytes:
    return _xtts.synth(text, speaker)


def _synth_edge(text: str, speaker: str | None) -> bytes:
    from agent.infrastructure.tts.tts_edge import synthesize as edge_synth

    return edge_synth(text)


def _synth_sapi(text: str, speaker: str | None) -> bytes:
    from agent.infrastructure.tts.tts_sapi import synthesize as sapi_synth

    return sapi_synth(text)


def synthesize(text: str, speaker_wav: str | None = None, voice: str | None = None) -> bytes:
    """Résout le backend TTS réel disponible et synthétise en WAV 24 kHz.

    Lève XttsUnavailableError s'il n'existe AUCUN backend fonctionnel — jamais un faux
    audio, jamais un silence pré-enregistré.
    """
    from agent import mode as app_mode

    if not app_mode.is_live():
        # Harnais : aucun service externe, aucun débit système — saisie texte.
        raise XttsUnavailableError(
            "TTS non disponible en mode deterministic (Version B : saisie texte)"
        )

    last_error: Exception | None = None
    for backend in _backend_order():
        try:
            if backend == "xtts":
                return _synth_xtts(text, speaker_wav)
            if backend == "edge":
                return _synth_edge(text, voice)
            if backend == "sapi":
                return _synth_sapi(text)
        except XttsUnavailableError as exc:
            last_error = exc
            continue
        except Exception as exc:  # backend imprévu : on n'invente pas, on tente le suivant
            last_error = exc
            continue
    raise XttsUnavailableError(
        f"Aucun backend TTS disponible ({', '.join(_backend_order()) or 'aucun'}) : "
        f"{last_error or 'désactivé (off)'}"
    )


def synthesize_reply(display_fr: str, spoken_wo: str | None,
                     speaker_wav: str | None = None) -> tuple[bytes, str]:
    """Voix de l'agent : le WOLOF d'abord (Adia, puis MMS), la voix française
    (Edge) en repli. Rend (WAV, langue réellement parlée : « wo » ou « fr »).

    Jamais de mélange : si la version wolof ne peut pas être dite, c'est la
    phrase FRANÇAISE qui est lue (et non du wolof lu par une voix française).
    """
    from agent import mode as app_mode
    from agent.infrastructure.tts import tts_wolof

    if not app_mode.is_live():
        raise XttsUnavailableError(
            "TTS non disponible en mode deterministic (Version B : saisie texte)"
        )
    if spoken_wo:
        try:
            wav, engine = tts_wolof.synthesize(spoken_wo)
            return wav, "wo"
        except tts_wolof.WolofTtsUnavailableError:
            pass  # journalisé par tts_wolof ; repli honnête sur la voix française
    return synthesize(display_fr, speaker_wav=speaker_wav), "fr"


def stream_reply(display_fr: str, spoken_wo: str | None, speaker_wav: str | None = None):
    """Voix de l'agent PHRASE PAR PHRASE : générateur de (WAV, langue).

    L'agent parle dès la première phrase prête ; la suivante se synthétise
    pendant la lecture (latence perçue divisée). Wolof d'abord (même moteur pour
    toute la réponse = même voix) ; si la PREMIÈRE phrase wolof échoue, toute la
    réponse est dite en français. Un échec en cours de réponse arrête la voix
    (le texte, lui, est déjà affiché) : jamais un mélange de langues.
    """
    from agent import mode as app_mode
    from agent.infrastructure.tts import tts_wolof

    if not app_mode.is_live():
        raise XttsUnavailableError(
            "TTS non disponible en mode deterministic (Version B : saisie texte)"
        )
    sentences = tts_wolof.split_sentences(spoken_wo) if spoken_wo else []
    if sentences:
        engine: str | None = None
        for i, sentence in enumerate(sentences):
            try:
                wav, engine = tts_wolof.synthesize(sentence, only=engine)
            except tts_wolof.WolofTtsUnavailableError:
                if i == 0:
                    break  # aucune voix wolof : repli français ci-dessous
                return
            yield wav, "wo"
        else:
            return
    yield synthesize(display_fr, speaker_wav=speaker_wav), "fr"


__all__ = ["synthesize", "synthesize_reply", "stream_reply", "XttsUnavailableError"]