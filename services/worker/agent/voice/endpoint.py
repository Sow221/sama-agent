"""Détection de parole CÔTÉ SERVEUR (début / fin d'énoncé) — pur, testable.

Pourquoi : le tour vocal dépendait d'un VAD dans le navigateur (WASM, worklet,
AudioContext) qui, sur mobile, peut rester muet (contexte audio suspendu,
fichiers non servis, second accès micro coupé par iOS). Résultat : « ça écoute
mais rien ne se passe ». Le worker reçoit déjà le micro par LiveKit : il décide
donc lui-même quand l'usager parle et quand il a fini, sur l'énergie du signal
(seuil adaptatif au bruit ambiant). Le navigateur n'a plus qu'à publier son micro.
"""
from __future__ import annotations

from array import array
from collections import deque
from dataclasses import dataclass, field
import math

START = "start"
END = "end"


def rms_int16(pcm: bytes) -> float:
    """Énergie RMS d'une trame PCM 16 bits (sans numpy : trames de 10–20 ms)."""
    if len(pcm) < 2:
        return 0.0
    samples = array("h")
    samples.frombytes(pcm[: len(pcm) - (len(pcm) % 2)])
    if not samples:
        return 0.0
    return math.sqrt(sum(s * s for s in samples) / len(samples))


@dataclass
class Endpointer:
    """Machine à états silence → parole → silence, trame par trame.

    `feed(pcm)` rend None, (START, None) au début d'un énoncé, ou
    (END, pcm_de_l_énoncé) quand l'usager s'est tu `end_ms` millisecondes.
    """

    sample_rate: int = 48_000
    start_ms: int = 150        # parole soutenue avant de déclarer un début
    end_ms: int = 700          # silence qui clôt l'énoncé
    preroll_ms: int = 400      # audio gardé AVANT le début (1re syllabe)
    min_speech_ms: int = 300   # plus court : bruit, pas un énoncé
    max_ms: int = 15_000       # énoncé coupé au-delà (borne mémoire)
    start_factor: float = 3.0  # seuil = bruit ambiant × facteur
    min_threshold: float = 300.0
    floor: float = 150.0       # bruit ambiant estimé (moyenne glissante)
    calibration_ms: int = 500  # écoute initiale : mesure du bruit de la pièce
    _calib_ms: float = 0.0
    _calib_sum: float = 0.0
    _calib_n: int = 0
    _speaking: bool = False
    _loud_ms: float = 0.0
    _quiet_ms: float = 0.0
    _speech_ms: float = 0.0
    _voiced_ms: float = 0.0
    _peak: float = 0.0         # niveau de la VOIX de l'usager pendant l'énoncé
    _quiet_sum: float = 0.0    # niveau des pauses de l'énoncé = bruit de fond réel
    _quiet_n: int = 0
    _pre: deque = field(default_factory=deque, repr=False)
    _pre_ms: float = 0.0
    _utt: list = field(default_factory=list, repr=False)

    @property
    def speaking(self) -> bool:
        return self._speaking

    def _ms(self, pcm: bytes) -> float:
        return (len(pcm) / 2) / self.sample_rate * 1000.0

    def threshold(self, strict: bool = False) -> float:
        factor = self.start_factor * (2.0 if strict else 1.0)
        return max(self.floor * factor, self.min_threshold * (2.0 if strict else 1.0))

    def reset(self) -> None:
        self._speaking = False
        self._loud_ms = self._quiet_ms = self._speech_ms = self._pre_ms = self._voiced_ms = 0.0
        self._peak = 0.0
        self._quiet_sum = 0.0
        self._quiet_n = 0
        self._pre.clear()
        self._utt.clear()

    def feed(self, pcm: bytes, strict: bool = False):
        """`strict` : l'agent parle (écho possible) → seuil doublé pour couper."""
        if not pcm:
            return None
        ms = self._ms(pcm)
        level = rms_int16(pcm)
        if self._calib_ms < self.calibration_ms:
            # Première demi-seconde : on apprend le bruit de la pièce, sans décider.
            self._calib_ms += ms
            self._calib_sum += level
            self._calib_n += 1
            self.floor = max(self._calib_sum / self._calib_n, 20.0)
            return None
        loud = level >= self.threshold(strict)

        if not self._speaking:
            # Pré-écoute : garde les dernières centaines de ms (début de mot).
            self._pre.append(pcm)
            self._pre_ms += ms
            while self._pre_ms > self.preroll_ms and len(self._pre) > 1:
                self._pre_ms -= self._ms(self._pre.popleft())
            if loud:
                # Un bruit CONSTANT finit par relever le seuil (quelques secondes).
                self.floor += 0.003 * (level - self.floor)
                self._loud_ms += ms
                if self._loud_ms >= self.start_ms:
                    self._speaking = True
                    self._utt = list(self._pre)
                    self._speech_ms = self._pre_ms
                    self._voiced_ms = self._loud_ms
                    self._peak = level
                    self._quiet_ms = 0.0
                    self._pre.clear()
                    self._pre_ms = 0.0
                    return (START, None)
            else:
                self._loud_ms = 0.0
                # Le bruit ambiant ne s'apprend QUE hors parole.
                self.floor = 0.95 * self.floor + 0.05 * max(level, 1.0)
            return None

        self._utt.append(pcm)
        self._speech_ms += ms
        # « Silence » = nettement sous la voix de l'usager, pas seulement sous un seuil
        # absolu : avec un bruit de fond constant (ventilateur, rue, clim), l'ancien
        # critère ne voyait jamais la fin de la phrase → écoute jusqu'à 20 s.
        self._peak = max(self._peak * 0.995, level)
        voiced = level >= max(self.threshold() * 0.6, self._peak * 0.2)
        self._quiet_ms = 0.0 if voiced else self._quiet_ms + ms
        if voiced:
            self._voiced_ms += ms
        else:
            self._quiet_sum += level
            self._quiet_n += 1
        if self._quiet_ms >= self.end_ms or self._speech_ms >= self.max_ms:
            voiced_ms = self._voiced_ms
            utterance = b"".join(self._utt)
            if self._quiet_n:
                # Le bruit entendu pendant les pauses devient la référence : il ne
                # redéclenchera pas un faux début de phrase juste après.
                self.floor = max(self.floor, self._quiet_sum / self._quiet_n)
            self.reset()
            if voiced_ms < self.min_speech_ms:
                return None
            return (END, utterance)
        return None
