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
    """CONCREE/Adia_TTS — voix wolof principale.

    Réglages qui font la différence à l'oreille :
      · deux tokenizers : Adia dérive de parler-tts-mini-MULTILINGUAL, dont la
        description de voix passe par le tokenizer de l'encodeur de texte (flan-t5)
        et la phrase par celui du modèle — les confondre dégrade la voix ;
      · graine fixe à chaque phrase : sinon Parler-TTS échantillonne une voix
        légèrement différente d'une phrase à l'autre ;
      · demi-précision (bf16/fp16) + attention SDPA sur GPU ; une phrase de
        préchauffage au chargement (noyaux GPU prêts avant le premier usager).
    """

    name = "adia"

    def _load(self):  # pragma: no cover - GPU / hub
        import torch
        from parler_tts import ParlerTTSForConditionalGeneration
        from transformers import AutoTokenizer

        repo = os.getenv("WOLOF_ADIA_MODEL", "CONCREE/Adia_TTS")
        device = _device()
        dtype = torch.float32
        if device == "cuda":
            dtype = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16
        try:
            model = ParlerTTSForConditionalGeneration.from_pretrained(
                repo, torch_dtype=dtype, attn_implementation="sdpa")
        except (TypeError, ValueError):  # version de parler-tts sans SDPA
            model = ParlerTTSForConditionalGeneration.from_pretrained(repo, torch_dtype=dtype)
        model = model.to(device).eval()
        prompt_tok = AutoTokenizer.from_pretrained(repo)
        try:
            desc_tok = AutoTokenizer.from_pretrained(model.config.text_encoder._name_or_path)
        except Exception:
            desc_tok = prompt_tok
        loaded = (model, prompt_tok, desc_tok)
        self._synth(loaded, os.getenv("ADIA_WARMUP_TEXT", "Na nga def."))  # préchauffage GPU
        return loaded

    def _synth(self, model, text: str) -> bytes:  # pragma: no cover - GPU
        import torch

        parler, prompt_tok, desc_tok = model
        desc = desc_tok(ADIA_DESCRIPTION, return_tensors="pt").to(parler.device)
        prompt = prompt_tok(text, return_tensors="pt").to(parler.device)
        torch.manual_seed(int(os.getenv("ADIA_SEED", "42")))  # même voix à chaque phrase
        with torch.no_grad():
            audio = parler.generate(
                input_ids=desc.input_ids,
                attention_mask=desc.attention_mask,
                prompt_input_ids=prompt.input_ids,
                prompt_attention_mask=prompt.attention_mask,
            )
        return _float_to_wav(audio[0].float().cpu().numpy(), parler.config.sampling_rate)


ENGINES: dict[str, _Engine] = {"adia": AdiaWolof(), "mms": MmsWolof()}


def engine_order() -> list[str]:
    raw = os.getenv("SAMA_TTS_WOLOF", "adia,mms").strip().lower()  # Adia d'abord
    if raw in ("", "off", "none"):
        return []
    return [n.strip() for n in raw.split(",") if n.strip() in ENGINES]


def split_sentences(text: str, max_chars: int = 180) -> list[str]:
    """Découpe en phrases courtes : Parler-TTS est plus juste sur des phrases
    brèves, et l'agent peut parler dès la PREMIÈRE phrase prête (latence perçue)."""
    import re

    parts = [p.strip() for p in re.split(r"(?<=[.!?:;])\s+", text) if p.strip()]
    out: list[str] = []
    for part in parts:
        if out and len(out[-1]) + len(part) < 40:  # pas de micro-phrase isolée
            out[-1] = f"{out[-1]} {part}"
        elif len(part) > max_chars:
            words, cur = part.split(), ""
            for w in words:
                if cur and len(cur) + len(w) + 1 > max_chars:
                    out.append(cur)
                    cur = w
                else:
                    cur = f"{cur} {w}".strip()
            if cur:
                out.append(cur)
        else:
            out.append(part)
    return out


def synthesize(text: str, only: str | None = None) -> tuple[bytes, str]:
    """WAV wolof réel + nom du moteur utilisé. Lève si aucun moteur n'aboutit.
    `only` impose un moteur (les phrases d'une même réponse gardent la même voix)."""
    errors: list[str] = []
    for name in ([only] if only else engine_order()):
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
