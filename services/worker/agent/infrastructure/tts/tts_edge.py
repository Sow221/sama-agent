"""TTS réel — Microsoft Edge neural (edge-tts), voix française, WAV 24 kHz.

Pourquoi ce fournisseur (mission clôture) :
  · galsenai/xTTS-v2-wolof est structurellement INUTILISABLE aujourd'hui : le repo HF
    ne contient que `.gitattributes`, `README.md`, `checkpoint-id.yml` (ZÉRO poids) et
    le serveur de modèles Coqui (base xTTS v2 obligatoire) est hors ligne (404).
  · Ce provider produit de la VRAIE parole neuronale (français de haute qualité) avec
    uniquement des paquets pip, sans binaire système. Le décodage MP3 est réalisé par
    `miniaudio` (bibliothèque embarquée, wheels Windows officielles) → PCM 24 kHz mono
    16 bits, exactement le format attendu par le worker vocal.

Dégradé honnête : toute panne (réseau, voix inconnue, décodage) lève
XttsUnavailableError — le résolveur bascule sur SAPI, ou le front sur le texte.
"""
from __future__ import annotations

import asyncio
import io
import os
from typing import BinaryIO

from agent.infrastructure.tts.tts_xtts import XttsUnavailableError

#: Voix française par défaut (neural, haute qualité).
EDGE_VOICE = os.getenv("EDGE_TTS_VOICE", "fr-FR-DeniseNeural")


def _synthesize_async(text: str, voice: str, out: BinaryIO) -> None:  # pragma: no cover - réseau
    import edge_tts

    async def _run() -> None:
        communicate = edge_tts.Communicate(text, voice=voice)
        await communicate.save(out)

    asyncio.run(_run())


def synthesize(text: str, voice: str | None = None) -> bytes:
    """Génère un WAV réel (24 kHz mono 16 bits) depuis la voix Edge neural."""
    if not text.strip():
        raise XttsUnavailableError("texte vide : rien à synthétiser")
    voice = voice or EDGE_VOICE
    try:
        import edge_tts  # noqa: F401  (présence réelle du paquet)
        import miniaudio
    except ImportError as exc:  # pragma: no cover - dépend du poste
        raise XttsUnavailableError(f"edge-tts/miniaudio absents : {exc}") from exc

    mp3 = io.BytesIO()
    try:
        _synthesize_async(text, voice, mp3)
    except Exception as exc:
        raise XttsUnavailableError(f"Edge TTS injoignable : {exc}") from exc
    if mp3.tell() == 0:
        raise XttsUnavailableError("Edge TTS a rendu un flux vide")

    mp3.seek(0)
    try:
        decoded = miniaudio.decode(
            mp3.read(),
            output_format=miniaudio.SampleFormat.SIGNED16,
            nchannels=1,
            sample_rate=24_000,
        )
    except Exception as exc:
        raise XttsUnavailableError(f"décodage MP3 Edge impossible : {exc}") from exc
    if not decoded.samples:
        raise XttsUnavailableError("décodage Edge vide")

    # WAV RIFF réel au format du worker (24 kHz mono 16 bits).
    from agent.voice.audio import pcm_to_wav

    return pcm_to_wav(decoded.samples.tobytes(), sample_rate=decoded.sample_rate)