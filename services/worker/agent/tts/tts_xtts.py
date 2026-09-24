"""
TTS wolof — galsenai/xTTS-v2-wolof (ADR-003) : clonage vocal 6 s, chargé fp16 GPU Brev.
Attribution GalsenAI obligatoire (audible à la démo) — licence xTTS/Coqui à vérifier (jour J).
En mode deterministic : TTS indisponible → RuntimeError lisible (front bascule texte).
"""
from __future__ import annotations

import io
import os

from agent import mode as app_mode


class _LazyXtTS:
    _tts = None

    def _load(self):
        if self._tts is None:
            from TTS.api import TTS

            model_id = os.getenv("XTTS_MODEL", "galsenai/xTTS-v2-wolof")
            device = os.getenv("SAMA_DEVICE", "cuda")
            pt_path = os.getenv("XTTS_CHECKPOINT")
            config_path = os.getenv("XTTS_CONFIG")
            self._tts = TTS(model_path=pt_path, config_path=config_path).to(device) if pt_path else TTS(model_id).to(device)
        return self._tts

    def synth(self, text: str, speaker_wav: str | None, sample_rate: int = 24000) -> bytes:
        if not app_mode.is_live():
            raise RuntimeError("TTS non disponible en mode deterministic (Version B : saisie texte)")
        tts = self._load()
        out = io.BytesIO()
        tts.tts_to_file(
            text=text,
            speaker_wav=speaker_wav or os.getenv("XTTS_SPEAKER", ""),
            file_path=out,
            sample_rate=sample_rate,
        )
        out.seek(0)
        return out.read()  # fichier WAV réellement synthétisé

    def synthesize(self, text: str, speaker_wav: str | None = None) -> bytes:
        return self.synth(text, speaker_wav)


_xtts = _LazyXtTS()


def synthesize(text: str, speaker_wav: str | None = None) -> bytes:
    """Sortie : audio WAV réel de la voix wolof (vraie chaîne, zéro playback pré-enregistré)."""
    return _xtts.synthesize(text, speaker_wav)