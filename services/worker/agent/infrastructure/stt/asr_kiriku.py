"""ASR wolof — Kiriku-Wolof-ASR (AIHubSN / IA Hub Sénégal), fine-tune whisper-large-v2,
SOTA wolof (WER 20,7 %). Chargé fp16 sur GPU Brev (ADR-002).
En mode deterministic : ASR indisponible → lever une erreur lisible (le front bascule texte).
Fournisseur interchangeable (référence §5.5) : le domaine ne dépend pas de cette classe.
"""
from __future__ import annotations

import os

from agent import mode as app_mode


class KirikuUnavailableError(RuntimeError):
    pass


class _LazyKiriku:
    """Charge le modèle UNE fois (warm), le jour J seulement (GPU Brev)."""
    _pipe = None

    def _load(self):
        if self._pipe is None:
            from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor, pipeline

            model_id = os.getenv("KIRIKU_MODEL", "AIHubSN/Kiriku-Wolof-ASR")
            device = 0 if os.getenv("SAMA_DEVICE", "cuda").lower() == "cuda" else -1
            torch_dtype = "float16" if device == 0 else "float32"
            processor = AutoProcessor.from_pretrained(model_id)
            model = AutoModelForSpeechSeq2Seq.from_pretrained(
                model_id, torch_dtype=torch_dtype, low_cpu_mem_usage=True
            ).to("cuda" if device == 0 else "cpu")
            self._pipe = pipeline(
                "automatic-speech-recognition",
                model=model,
                tokenizer=processor.tokenizer,
                feature_extractor=processor.feature_extractor,
                device=device,
                generate_kwargs={"language": "wolof", "task": "transcribe"},
            )
        return self._pipe

    def transcribe(self, audio_wav_bytes: bytes) -> str:
        if not app_mode.is_live():
            raise KirikuUnavailableError(
                "ASR non disponible en mode deterministic (Version B : saisie texte)"
            )
        pipe = self._load()
        result = pipe(audio_wav_bytes)
        return str(result.get("text", "")).strip()


_kiriku = _LazyKiriku()


def transcribe(audio_wav_bytes: bytes) -> str:
    """Entrée : chunk audio WAV (16 kHz mono) — sortie : texte wolof réel."""
    return _kiriku.transcribe(audio_wav_bytes)