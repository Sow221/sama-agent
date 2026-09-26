"""TTS WOLOF réel — alternatives à galsenai/xTTS-v2-wolof (publié sans poids utilisables).

Deux moteurs open source, chargés une fois (GPU Brev), essayés dans l'ordre
`SAMA_TTS_WOLOF` (défaut « adia,mms ») :

  · adia : CONCREE/Adia_TTS — Parler-TTS mini multilingue affiné sur ~40 h de
           wolof (Apache 2.0). Voix la plus naturelle ; demande le paquet
           `parler_tts` (installé par infra/brev/setup-brev.sh).
  · mms  : facebook/mms-tts-wol — VITS du projet Massively Multilingual Speech de
           Meta (CC-BY-NC 4.0 : usage non commercial). Léger et rapide ; ne
           demande que `transformers` (déjà présent).

Chaque moteur rend un WAV 24 kHz mono 16 bits (format du worker vocal). Toute
panne lève WolofTtsUnavailableError : le résolveur passe au suivant, puis à la
voix française (Edge). Jamais de voix fabriquée ni d'audio pré-enregistré.
"""
from __future__ import annotations

import logging
import os
import threading

from agent.infrastructure.tts.tts_xtts import XttsUnavailableError

log = logging.getLogger("sama.tts.wolof")

OUT_RATE = 24_000

#: Description de voix Parler-TTS (le modèle conditionne la voix sur ce texte).
ADIA_DESCRIPTION = os.getenv(
    "ADIA_DESCRIPTION",
    "A clear and educational voice, with a flow adapted to learning",
)


class WolofTtsUnavailableError(XttsUnavailableError):
    """Moteur wolof absent, non chargeable ou en échec — le résolveur passe au suivant."""


def _float_to_wav(samples, src_rate: int) -> bytes:
    """Signal flottant [-1, 1] (tableau numpy/torch 1-D) → WAV 24 kHz mono 16 bits."""
    import numpy as np

    from agent.voice.audio import pcm_to_wav, resample_int16

    arr = np.asarray(samples, dtype=np.float32).reshape(-1)
    if arr.size == 0:
        raise WolofTtsUnavailableError("synthèse wolof vide")
    pcm = (np.clip(arr, -1.0, 1.0) * 32767.0).astype(np.int16).tobytes()
    if src_rate != OUT_RATE:
        pcm = resample_int16(pcm, src_rate, OUT_RATE)
    return pcm_to_wav(pcm, sample_rate=OUT_RATE)


def _device() -> str:
    return "cuda" if os.getenv("SAMA_DEVICE", "cuda").lower() == "cuda" else "cpu"


class _Engine:
    """Chargement paresseux, unique par process (sessions vocales en threads)."""

    name = "?"

    def __init__(self) -> None:
        self._model = None
        self._lock = threading.Lock()

    def _load(self):  # pragma: no cover - dépend du GPU / du hub
        raise NotImplementedError

    def _synth(self, model, text: str) -> bytes:  # pragma: no cover
        raise NotImplementedError

    def load(self):
        with self._lock:
            if self._model is None:
                try:
                    self._model = self._load()
                except Exception as exc:
                    raise WolofTtsUnavailableError(f"{self.name} non chargeable : {exc}") from exc
            return self._model

    def synthesize(self, text: str) -> bytes:
        if not text.strip():
            raise WolofTtsUnavailableError("texte vide")
        model = self.load()
        try:
            with self._lock:  # une synthèse à la fois sur le GPU
                return self._synth(model, text)
        except WolofTtsUnavailableError:
            raise
        except Exception as exc:
            raise WolofTtsUnavailableError(f"{self.name} en échec : {exc}") from exc


class MmsWolof(_Engine):
    name = "mms"

    def _load(self):  # pragma: no cover - GPU / hub
        from transformers import AutoTokenizer, VitsModel

        repo = os.getenv("WOLOF_MMS_MODEL", "facebook/mms-tts-wol")
        model = VitsModel.from_pretrained(repo).to(_device()).eval()
        return model, AutoTokenizer.from_pretrained(repo)

    def _synth(self, model, text: str) -> bytes:  # pragma: no cover - GPU
        import torch

        vits, tokenizer = model
        inputs = tokenizer(text, return_tensors="pt").to(vits.device)
        with torch.no_grad():
            wave = vits(**inputs).waveform[0].float().cpu().numpy()
        return _float_to_wav(wave, vits.config.sampling_rate)


class AdiaWolof(_Engine):
    name = "adia"

    def _load(self):  # pragma: no cover - GPU / hub
        from parler_tts import ParlerTTSForConditionalGeneration
        from transformers import AutoTokenizer

        repo = os.getenv("WOLOF_ADIA_MODEL", "CONCREE/Adia_TTS")
        model = ParlerTTSForConditionalGeneration.from_pretrained(repo).to(_device()).eval()
        return model, AutoTokenizer.from_pretrained(repo)

    def _synth(self, model, text: str) -> bytes:  # pragma: no cover - GPU
        import torch

        parler, tokenizer = model
        desc = tokenizer(ADIA_DESCRIPTION, return_tensors="pt").input_ids.to(parler.device)
        prompt = tokenizer(text, return_tensors="pt").input_ids.to(parler.device)
        with torch.no_grad():
            audio = parler.generate(input_ids=desc, prompt_input_ids=prompt)
        return _float_to_wav(audio[0].float().cpu().numpy(), parler.config.sampling_rate)


ENGINES: dict[str, _Engine] = {"adia": AdiaWolof(), "mms": MmsWolof()}


def engine_order() -> list[str]:
    raw = os.getenv("SAMA_TTS_WOLOF", "adia,mms").strip().lower()
    if raw in ("", "off", "none"):
        return []
    return [n.strip() for n in raw.split(",") if n.strip() in ENGINES]


def synthesize(text: str) -> tuple[bytes, str]:
    """WAV wolof réel + nom du moteur utilisé. Lève si aucun moteur n'aboutit."""
    errors: list[str] = []
    for name in engine_order():
        try:
            return ENGINES[name].synthesize(text), name
        except WolofTtsUnavailableError as exc:
            log.warning("TTS wolof %s indisponible : %s", name, exc)
            errors.append(str(exc))
    raise WolofTtsUnavailableError("; ".join(errors) or "TTS wolof désactivé (SAMA_TTS_WOLOF=off)")


def warm() -> None:
    """Charge le premier moteur wolof disponible (démarrage de l'agent voix)."""
    for name in engine_order():
        try:
            ENGINES[name].load()
            log.info("TTS wolof prêt : %s", name)
            return
        except WolofTtsUnavailableError as exc:
            log.warning("préchauffage TTS wolof %s impossible : %s", name, exc)
