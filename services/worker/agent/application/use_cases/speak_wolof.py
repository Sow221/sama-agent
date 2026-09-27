"""Use case : dire une réponse du chat EN WOLOF (texte wolof + audio Adia).

La réponse écrite du chat est en français (ou en wolof si l'usager écrit en
wolof). Pour l'écouter, le LLM la redit en wolof parlé, court, puis la voix
wolof Adia la prononce phrase par phrase. Réel de bout en bout : pas de voix
enregistrée, pas de texte modèle.
"""
from __future__ import annotations

import io
import re
import wave

from agent import mode as app_mode

_THINK = re.compile(r"<think>.*?</think>", re.S)

_SYSTEM = (
    "Tu reformules une réponse d'assistant administratif en WOLOF PARLÉ, naturel, "
    "tel qu'on le parle à Dakar : 2 à 4 phrases courtes, sans liste, sans lien, sans "
    "markdown, sans chiffre romain. Garde les informations utiles (où aller, quoi "
    "apporter, combien). Réponds UNIQUEMENT par le texte wolof."
)


class SpeakUnavailableError(RuntimeError):
    """Pas de voix wolof possible (mode déterministe, modèle absent…)."""


def _join_wavs(parts: list[bytes]) -> bytes:
    """Concatène des WAV de même format en un seul fichier."""
    frames, params = [], None
    for part in parts:
        with wave.open(io.BytesIO(part)) as w:
            params = params or w.getparams()
            frames.append(w.readframes(w.getnframes()))
    out = io.BytesIO()
    with wave.open(out, "wb") as w:
        w.setparams(params)
        w.writeframes(b"".join(frames))
    return out.getvalue()


def to_spoken_wolof(text: str, llm=None) -> str:
    from agent.infrastructure.llm.glm import GlmLlm

    llm = llm or GlmLlm()
    raw = llm.chat_text(
        [{"role": "system", "content": _SYSTEM}, {"role": "user", "content": text[:4000]}],
        max_tokens=260,
    )
    return _THINK.sub("", raw).replace("*", "").strip()


def speak_wolof(text: str, llm=None) -> tuple[str, bytes]:
    """(texte wolof, WAV) — lève SpeakUnavailableError si la voix est impossible."""
    if not app_mode.is_live():
        raise SpeakUnavailableError("voix wolof indisponible en mode déterministe")
    from agent.infrastructure.tts import tts_wolof

    wolof = to_spoken_wolof(text, llm=llm)
    if not wolof:
        raise SpeakUnavailableError("reformulation wolof vide")
    try:
        parts = [tts_wolof.synthesize(s)[0] for s in tts_wolof.split_sentences(wolof)]
    except tts_wolof.WolofTtsUnavailableError as exc:
        raise SpeakUnavailableError(str(exc)) from exc
    if not parts:
        raise SpeakUnavailableError("aucune phrase à dire")
    return wolof, _join_wavs(parts)
