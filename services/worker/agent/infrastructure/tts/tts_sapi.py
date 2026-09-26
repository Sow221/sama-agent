"""TTS réel — synthèse vocale native Windows (SAPI5), disponible hors ligne.

Secours du résolveur TTS : la synthèse est faite par le système d'exploitation
lui-même (voix « Microsoft David/Zira Desktop ») — aucun service distant. La sortie
SAPI (généralement 22,05 kHz) est rééchantillonnée proprement vers 24 kHz via les
helpers stdlib du worker (`resample_int16`), format exigé par la publication LiveKit.

Dégradé honnête : absence de la voix, échec du moteur ou sortie vide →
XttsUnavailableError (le résolveur tente ensuite le backend suivant, sinon texte).
"""
from __future__ import annotations

import io
import os
import tempfile
from pathlib import Path

from agent.infrastructure.tts.tts_xtts import XttsUnavailableError

#: Vitesse/débit SAPI (0=n5ormal, ±10 max) — réglable, borné.
SAPI_RATE = int(os.getenv("SAPI_TTS_RATE", "0"))
SAPI_VOICE = os.getenv("SAPI_TTS_VOICE", "")


def _pick_voice(engine) -> str:  # pragma: no cover - dépend du poste
    """Choisit une voix française si possible, sinon la première disponible."""
    if SAPI_VOICE:
        return SAPI_VOICE
    available = [v.id for v in engine.getProperty("voices")]
    for vid in available:
        if "FR" in vid.upper() or "HORT" in vid.upper():
            return vid
    return available[0] if available else ""


def synthesize(text: str) -> bytes:
    """Génère un WAV réel (mono 16 bits, rééchantillonné à 24 kHz) via SAPI5."""
    if not text.strip():
        raise XttsUnavailableError("texte vide : rien à synthétiser")
    try:
        import pyttsx3
    except ImportError as exc:  # pragma: no cover - dépend du poste
        raise XttsUnavailableError(f"pyttsx3 absent : {exc}") from exc

    with tempfile.TemporaryDirectory(prefix="sama_tts_") as tmp:
        out_path = str(Path(tmp) / "sapi.wav")
        try:
            engine = pyttsx3.init()
            voice = _pick_voice(engine)
            if voice:
                engine.setProperty("voice", voice)
            engine.setProperty("rate", 150 + SAPI_RATE * 10)
            engine.save_to_file(text, out_path)
            engine.runAndWait()
            data = Path(out_path).read_bytes()
            engine.stop()
        except Exception as exc:
            raise XttsUnavailableError(f"SAPI en échec : {exc}") from exc

        if not data:
            raise XttsUnavailableError("SAPI a rendu un fichier vide")

    from agent.voice.audio import (
        AudioFormatError,
        pcm_to_wav,
        resample_int16,
        wav_to_pcm,
    )

    try:
        pcm, rate = wav_to_pcm(data)
    except AudioFormatError as exc:
        raise XttsUnavailableError(f"SAPI WAV inexploitable : {exc}") from exc
    if rate == 24_000:
        return data
    # Format exact exigé par la publication (24 kHz) : rééchantillonnage stdlib.
    return pcm_to_wav(resample_int16(pcm, rate, 24_000), sample_rate=24_000)