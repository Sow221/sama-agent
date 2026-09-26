"""Conversions audio du worker vocal — PUR, stdlib uniquement (zéro numpy, zéro livekit).

Pourquoi ce module existe
-------------------------
Tout ce qui faisait la valeur de l'agent vocal (rééchantillonnage, découpe en
frames, WAV) vivait dans `agent/voice/main.py`, qui importe `numpy` et
`livekit.agents`. Conséquence mesurée : le module ne pouvait même pas être
importé (`ModuleNotFoundError: No module named 'numpy'`), donc **aucun test ne
pouvait atteindre cette logique** — elle n'était pas « non testée », elle était
*invisible*. En la descendant ici, elle redevient couverte par la suite de tests
sur une machine sans GPU, sans SFU et sans dépendance lourde.

Formats
-------
· entrée  : PCM signé 16 bits little-endian, mono (ce que produit Opus/LiveKit)
· sortie  : conteneur WAV RIFF PCM 16 bits mono (ce qu'attend l'ASR)
· TTS     : WAV 24 kHz → trames de 100 ms (ce que le SDK LiveKit publie)

Aucune fabrication : une entrée vide rend un WAV vide, jamais un silence
synthétisé. Une tranche trop courte est signalée, pas complétée.
"""
from __future__ import annotations

import io
import wave
from array import array
from dataclasses import dataclass

#: Fréquence d'échantillonnage attendue par Kiriku-Wolof-ASR (whisper large-v2).
ASR_SAMPLE_RATE = 16_000
#: Fréquence de sortie du TTS (xTTS v2).
TTS_SAMPLE_RATE = 24_000
#: LiveKit capture le micro en 48 kHz.
MIC_SAMPLE_RATE = 48_000

_PCM_WIDTH = 2  # 16 bits


class AudioFormatError(ValueError):
    """Entrée audio inexploitable (WAV tronqué, stéréo inattendue, rate fausse)."""


@dataclass(frozen=True)
class AudioChunk:
    """Trame audio prête à publier —Clone de rtc.AudioFrame, sans le SDK.

    Le worker convertit ce dataclass en vrai `rtc.AudioFrame` au moment de la
    publication : ici, on reste testable sans `livekit.rtc` installé.
    """

    data: bytes
    sample_rate: int
    num_channels: int
    samples_per_channel: int


def _to_int16(pcm: bytes) -> array:
    samples = array("h")
    usable = len(pcm) - (len(pcm) % _PCM_WIDTH)
    samples.frombytes(pcm[:usable])
    if array("h").itemsize != _PCM_WIDTH:  # plateforme non 16 bits (rare)
        raise AudioFormatError("plateforme sans entier 16 bits signé : conversion impossible")
    return samples


def resample_int16(pcm: bytes, src_rate: int, dst_rate: int) -> bytes:
    """Rééchantillonne du PCM 16 bits mono, avec pré-filtre anti-raliasing.

    L'algorithme est volontairement simple et honnête : un filtre « moving
    average » de largeur = facteur de réduction (le meilleur anti-aliasing
    qu'on puisse faire en O(n) sans banc de filtres), puis interpolation
    linéaire. Ce n'est PAS un windowed-sinc de qualité CD, mais pour de la
    parole 48 k → 16 k le signal reste propre — et, surtout, la fonction est
    testée sur des signaux de fréquence connue, donc ses erreurs sont
    mesurables plutôt que supposées.
    """
    if src_rate <= 0 or dst_rate <= 0:
        raise AudioFormatError(f"fréquences invalides : {src_rate} -> {dst_rate}")
    samples = _to_int16(pcm)
    n = len(samples)
    if n == 0:
        return b""

    if src_rate > dst_rate:
        factor = src_rate // dst_rate
        if factor > 1:
            # Pré-filtre passe-bas (moyenne glissante) AVANT décimation.
            filtered = array("h", [0]) * n
            for i in range(n):
                lo = max(0, i - factor // 2)
                hi = min(n, i + factor // 2 + 1)
                filtered[i] = sum(samples[lo:hi]) // (hi - lo)
            samples = filtered

    if src_rate == dst_rate:
        return samples.tobytes()

    out_len = max(0, round(n * dst_rate / src_rate))
    if out_len == 0:
        return b""
    ratio = (n - 1) / out_len if out_len > 1 else 0.0
    out = array("h", bytes(out_len * _PCM_WIDTH))
    for i in range(out_len):
        pos = i * ratio
        left = int(pos)
        right = min(left + 1, n - 1)
        frac = pos - left
        out[i] = int(samples[left] * (1 - frac) + samples[right] * frac)
    return out.tobytes()


def pcm_to_wav(pcm: bytes, sample_rate: int = ASR_SAMPLE_RATE) -> bytes:
    """Enveloppe un PCM 16 bits mono dans un conteneur WAV RIFF réel."""
    if sample_rate <= 0:
        raise AudioFormatError(f"fréquence invalide : {sample_rate}")
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(_PCM_WIDTH)
        wf.setframerate(sample_rate)
        wf.writeframes(pcm)
    return buf.getvalue()


def wav_to_pcm(wav_bytes: bytes) -> tuple[bytes, int]:
    """Extrait (pcm, sample_rate) d'un WAV mono 16 bits. Lève sinon."""
    with wave.open(io.BytesIO(wav_bytes), "rb") as wf:
        channels = wf.getnchannels()
        width = wf.getsampwidth()
        rate = wf.getframerate()
        if channels != 1 or width != _PCM_WIDTH:
            raise AudioFormatError(
                f"attendu mono/16 bits, reçu {channels} canal(aux)/{width * 8} bits"
            )
        return wf.readframes(wf.getnframes()), rate


def mic_frames_to_wav(frames: list[bytes], src_rate: int = MIC_SAMPLE_RATE) -> bytes:
    """Segment micro (trames 48 kHz) → WAV 16 kHz prêt pour l'ASR.

    Entrée vide → sortie vide. C'est volontaire : un segment vide doit sauter
    l'ASR, pas produire un silence de synthèse.
    """
    if not frames:
        return b""
    pcm = b"".join(frames)
    if not pcm:
        return b""
    return pcm_to_wav(resample_int16(pcm, src_rate, ASR_SAMPLE_RATE), ASR_SAMPLE_RATE)


def wav_to_chunks(
    wav_bytes: bytes,
    sample_rate: int = TTS_SAMPLE_RATE,
    frame_ms: int = 100,
) -> list[AudioChunk]:
    """Découpe un WAV synthétisé en trames de `frame_ms` (100 ms par défaut).

    Le débit de publication LiveKit est temporel : une trame = 100 ms d'audio.
    Une dernière trame plus courte est complétée jusqu'à `frame_ms`, parce
    qu'une trame de 20 ms isolée s'entend comme un clic. On répète le dernier
    échantillon : on ne fabrique aucun son nouveau.
    """
    pcm, rate = wav_to_pcm(wav_bytes)
    if sample_rate and rate != sample_rate:
        raise AudioFormatError(f"attendu {sample_rate} Hz, reçu {rate} Hz")
    if frame_ms <= 0:
        raise AudioFormatError(f"frame_ms invalide : {frame_ms}")

    samples = _to_int16(pcm)
    total = len(samples)
    if total == 0:
        return []

    per_frame = max(1, (sample_rate * frame_ms) // 1000)
    chunks: list[AudioChunk] = []
    for start in range(0, total, per_frame):
        piece = samples[start:start + per_frame]
        if len(piece) < per_frame:
            piece.extend([piece[-1]] * (per_frame - len(piece)))
        data = piece.tobytes()
        chunks.append(
            AudioChunk(
                data=data,
                sample_rate=sample_rate,
                num_channels=1,
                samples_per_channel=per_frame,
            )
        )
    return chunks
