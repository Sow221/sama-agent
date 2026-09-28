"""Normalisation du wolof écrit et taux d'erreur de mots (WER). Pur, sans dépendance.

La normalisation ne gomme QUE ce qui n'est pas une erreur de langue : casse,
ponctuation, apostrophes typographiques, espaces. Les lettres du wolof (ë, é, à,
ñ, ŋ, ó…) sont conservées : « bëgg » et « begg » sont bien deux graphies
différentes, et la convention orthographique (J0-01) doit trancher, pas ce code.
"""
from __future__ import annotations

import re
import unicodedata

_APOSTROPHES = str.maketrans({"’": "'", "‘": "'", "ʼ": "'", "`": "'"})
_PUNCT = re.compile(r"[^\w'\s]", re.UNICODE)


def normalize(text: str) -> list[str]:
    """Mots comparables : minuscules, NFC, apostrophes unifiées, sans ponctuation."""
    text = unicodedata.normalize("NFC", text or "").lower().translate(_APOSTROPHES)
    text = _PUNCT.sub(" ", text)
    return [w.strip("'") for w in text.split() if w.strip("'")]


def word_errors(reference: list[str], hypothesis: list[str]) -> int:
    """Distance d'édition en mots (substitutions + insertions + suppressions)."""
    prev = list(range(len(hypothesis) + 1))
    for i, ref_word in enumerate(reference, 1):
        cur = [i] + [0] * len(hypothesis)
        for j, hyp_word in enumerate(hypothesis, 1):
            cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ref_word != hyp_word))
        prev = cur
    return prev[-1]


def wer(reference: str, hypothesis: str) -> float:
    """Taux d'erreur de mots, rapporté à la référence (1.0 si la référence est vide
    et l'hypothèse non ; 0.0 si les deux sont vides)."""
    ref, hyp = normalize(reference), normalize(hypothesis)
    if not ref:
        return 0.0 if not hyp else 1.0
    return word_errors(ref, hyp) / len(ref)
