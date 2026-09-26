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


__all__ = ["synthesize", "XttsUnavailableError"]