"""Contrôle K1 (doc 11 §4) : aller-retour de la voix.

Texte wolof → la bouche (Adia) le prononce → l'oreille (Kiriku) le retranscrit →
comparaison avec le texte d'origine. Une phrase qui revient intacte est
prononçable et comprise ; la paire (audio, texte) devient une donnée
d'entraînement pour l'oreille.

Les fournisseurs sont injectés : le contrôle est testable sans GPU, et le même
code tourne en production avec les vrais modèles (run_k1.py).
"""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from agent.datafactory.wer import wer

#: Seuil de départ (doc 11) : à recalibrer sur les verdicts de l'étalon.
K1_MAX_WER = 0.15

Synthesize = Callable[[str], bytes]   # texte wolof → WAV
Transcribe = Callable[[bytes], str]   # WAV → texte


@dataclass(frozen=True)
class RoundTrip:
    text: str
    heard: str
    wer: float
    passed: bool
    wav: bytes | None
    error: str | None = None

    def as_check(self) -> dict:
        """Trace stockée avec la donnée : on sait toujours pourquoi elle a été acceptée."""
        return {"heard": self.heard, "wer": round(self.wer, 4), "passed": self.passed,
                "threshold": K1_MAX_WER, "error": self.error}


def voice_roundtrip(text: str, synthesize: Synthesize, transcribe: Transcribe,
                    max_wer: float = K1_MAX_WER) -> RoundTrip:
    """Ne lève jamais : une panne d'un modèle est un échec du contrôle, tracé."""
    try:
        wav = synthesize(text)
    except Exception as exc:  # noqa: BLE001 — tracé dans la donnée
        return RoundTrip(text, "", 1.0, False, None, f"synthèse : {exc}"[:300])
    try:
        heard = transcribe(wav)
    except Exception as exc:  # noqa: BLE001
        return RoundTrip(text, "", 1.0, False, wav, f"transcription : {exc}"[:300])
    score = wer(text, heard)
    return RoundTrip(text, heard, score, score <= max_wer, wav)
