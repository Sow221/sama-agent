"""ASR wolof — Kiriku-Wolof-ASR (AIHubSN / IA Hub Sénégal), fine-tune whisper-large-v2,
SOTA wolof (WER 20,7 %). Chargé fp16 sur GPU Brev (ADR-002).
En mode deterministic : ASR indisponible → lever une erreur lisible (le front bascule texte).
Fournisseur interchangeable (référence §5.5) : le domaine ne dépend pas de cette classe.
"""
from __future__ import annotations

import io
import logging
import os
import wave

from agent import mode as app_mode

log = logging.getLogger("sama.asr")


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
            )
        return self._pipe

    #: Langue forcée au décodage. « wolof » n'est pas une langue Whisper standard :
    #: si le modèle la refuse, on retombe (une fois pour toutes) sur la détection
    #: du fine-tune. KIRIKU_LANGUAGE="" désactive le forçage d'emblée.
    _language: str | None = os.getenv("KIRIKU_LANGUAGE", "wolof").strip() or None

    def transcribe(self, audio_wav_bytes: bytes) -> str:
        if not app_mode.is_live():
            raise KirikuUnavailableError(
                "ASR non disponible en mode deterministic (Version B : saisie texte)"
            )
        pipe = self._load()
        # WAV décodé ici (stdlib) : le pipeline n'a pas besoin de ffmpeg sur le nœud.
        audio = _wav_to_input(audio_wav_bytes)
        generate_kwargs = {"task": "transcribe"}
        if self._language:
            generate_kwargs["language"] = self._language
        try:
            result = pipe(audio, generate_kwargs=generate_kwargs)
        except ValueError as exc:
            if not self._language or "language" not in str(exc).lower():
                raise
            log.warning("langue %r refusée par le modèle (%s) — détection du modèle", self._language, exc)
            type(self)._language = None
            result = pipe(audio, generate_kwargs={"task": "transcribe"})
        return str(result.get("text", "")).strip()


def _wav_to_input(wav_bytes: bytes) -> dict:
    """WAV PCM 16 bits mono → entrée brute du pipeline (float32 [-1, 1] + fréquence)."""
    import numpy as np

    with wave.open(io.BytesIO(wav_bytes), "rb") as wf:
        rate = wf.getframerate()
        pcm = wf.readframes(wf.getnframes())
    samples = np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768.0
    return {"raw": samples, "sampling_rate": rate}


_kiriku = _LazyKiriku()


def transcribe(audio_wav_bytes: bytes) -> str:
    """Entrée : chunk audio WAV (16 kHz mono) — sortie : texte wolof réel."""
    return _kiriku.transcribe(audio_wav_bytes)