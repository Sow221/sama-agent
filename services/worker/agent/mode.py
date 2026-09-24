"""
Mode de fonctionnement du worker (Version B, C §54).
  - "live"         : chaîne 100 % réelle (Kiriku ASR, GLM/NVIDIA, xTTS) — le jour J.
  - "deterministic": dégradé honnête sans LLM ni audio (intent par règles, document
                     → NEEDS_REVIEW) ; le front bascule en saisie texte. JAMAIS de sortie
                     fabriquée : aucun état n'est simulé.
"""
from __future__ import annotations

import os
from functools import lru_cache


@lru_cache(maxsize=1)
def mode() -> str:
    m = os.getenv("SAMA_MODE", "live").strip().lower()
    if m not in {"live", "deterministic"}:
        raise ValueError(f"SAMA_MODE invalide : {m!r} (attendu: live|deterministic)")
    return m


def is_live() -> bool:
    return mode() == "live"