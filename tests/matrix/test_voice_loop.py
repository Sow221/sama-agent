"""Boucle vocale — la logique métier, testée SANS GPU, SANS SFU, SANS modèle.

Ce que ce fichier change
------------------------
Avant la correction, 100 % de la logique vocale vivait dans
`agent/voice/main.py`, qui importe `numpy` et `livekit.agents`. Le module ne
pouvait donc pas être importé (`ModuleNotFoundError: No module named 'numpy'`)
et la logique était *hors d'atteinte de tout test*. Elle est désormais dans
`agent.voice.audio` / `agent.voice.protocol` / `agent.voice.session` — purs,
stdlib — et couverte ici :

  · rééchantillonnage 48 k → 16 k sur un signal de fréquence connue (l'erreur
    se mesure, elle ne se suppose pas) ;
  * decoupage du WAV de synthese en trames de 100 ms exactes, sans trame
    tronquée qui cliquette ;
  · barge-in : une réponse déjà partie ne revient pas en retard ;
  · dégradés honnêtes : ASR/TTS indisponibles → code d'erreur, jamais une
    phrase inventée pour faire semblant.
"""
from __future__ import annotations

import math
import struct
import wave
from array import array

import pytest

from agent.voice import protocol
from agent.voice.audio import (
    ASR_SAMPLE_RATE,
    MIC_SAMPLE_RATE,
    TTS_SAMPLE_RATE,
    AudioFormatError,
    mic_frames_to_wav,
    pcm_to_wav,
    resample_int16,
    wav_to_chunks,
    wav_to_pcm,
)
from agent.voice.session import VoiceSession, _Superseded


# ── Helpers de signal ─────────────────────────────────────────────────────
def tone(freq_hz: float, ms: float, rate: int, amp: int = 12_000) -> bytes:
    """Sinus pur, amplitude connue — pour mesurer une fréquence après conversion."""
    n = int(rate * ms / 1000)
    return array("h", (int(amp * math.sin(2 * math.pi * freq_hz * i / rate)) for i in range(n))).tobytes()


def dominant_hz(pcm: bytes, rate: int) -> float:
    """Fréquence dominante d'un PCM par corrélation, bornée par Nyquist.

    Volontairement naïf : on cherche le pic, pas la qualité de reconstruction.
    La borne `rate / 2` n'est pas cosmétique — sans elle, toute mesure au-delà
    de Nyquist se replie (aliasing) et renvoie une fréquence fantôme.
    """
    samples = array("h")
    samples.frombytes(pcm[: len(pcm) - len(pcm) % 2])
    n = len(samples)
    assert n > 0
    nyquist = rate / 2
    step = 50.0 if nyquist <= 2000 else 25.0
    best, best_score = 0.0, -1.0
    freq = step
    while freq < nyquist * 0.95:
        w = 2 * math.pi * freq / rate
        re = sum(s * math.cos(w * i) for i, s in enumerate(samples))
        im = sum(s * math.sin(w * i) for i, s in enumerate(samples))
        score = re * re + im * im
        if score > best_score:
            best, best_score = freq, score
        freq += step
    return best


# ── Audio : rééchantillonnage ─────────────────────────────────────────────
def test_resample_preserves_pitch() -> None:
    """48 k → 16 k d'un 440 Hz doit rester un 440 Hz (mesuré, pas supposé)."""
    src = tone(440.0, 120.0, MIC_SAMPLE_RATE)
    out = resample_int16(src, MIC_SAMPLE_RATE, ASR_SAMPLE_RATE)
    assert abs(dominant_hz(out, ASR_SAMPLE_RATE) - 440.0) < 30.0


def test_resample_halves_sample_count_for_3x_downsampling() -> None:
    """48000→16000 = ÷3 : la longueur doit suivre (hors pré-filtre)."""
    src = tone(1000.0, 100.0, MIC_SAMPLE_RATE)  # 4800 échantillons
    out = resample_int16(src, MIC_SAMPLE_RATE, ASR_SAMPLE_RATE)
    got = array("h")
    got.frombytes(out)
    assert abs(len(got) - 1600) <= 2, len(got)


def test_resample_is_a_noop_at_equal_rate() -> None:
    src = tone(440.0, 50.0, ASR_SAMPLE_RATE)
    assert resample_int16(src, ASR_SAMPLE_RATE, ASR_SAMPLE_RATE) == src


def test_resample_upscale_48k_to_16k_upsamples() -> None:
    """8 k → 16 k double la longueur (utile si le client envoie déjà en 8 k)."""
    src = tone(440.0, 100.0, 8000)
    out = resample_int16(src, 8000, ASR_SAMPLE_RATE)
    assert abs(len(out) // 2 - 1600) <= 2


def test_resample_empty_is_empty_not_silence() -> None:
    """Aucun échantillon → aucun octet. On ne fabrique pas de silence."""
    assert resample_int16(b"", 48000, 16000) == b""


def test_resample_rejects_invalid_rates() -> None:
    with pytest.raises(AudioFormatError):
        resample_int16(tone(440.0, 10.0, 48000), 0, 16000)
    with pytest.raises(AudioFormatError):
        resample_int16(tone(440.0, 10.0, 48000), 48000, -1)


# ── Audio : WAV ───────────────────────────────────────────────────────────
def test_pcm_to_wav_is_a_real_readable_wav() -> None:
    """Le conteneur produit doit être relisible par la lib `wave` de Python."""
    pcm = tone(440.0, 60.0, ASR_SAMPLE_RATE)
    wav = pcm_to_wav(pcm, ASR_SAMPLE_RATE)
    with wave.open(__import__("io").BytesIO(wav), "rb") as wf:
        assert wf.getnchannels() == 1
        assert wf.getsampwidth() == 2
        assert wf.getframerate() == ASR_SAMPLE_RATE
        assert wf.getnframes() == len(pcm) // 2


def test_mic_frames_to_wav_produces_16k_mono() -> None:
    """Le segment micro (48 k, en trames) sort en WAV 16 k mono : entrée de l'ASR."""
    frames = [tone(440.0, 20.0, MIC_SAMPLE_RATE) for _ in range(5)]  # 5 × 20 ms
    wav = mic_frames_to_wav(frames, MIC_SAMPLE_RATE)
    pcm, rate = wav_to_pcm(wav)
    assert rate == ASR_SAMPLE_RATE
    assert abs(len(pcm) // 2 - 16000 * 0.1) <= 40  # ~100 ms


def test_mic_frames_empty_gives_empty_not_silence() -> None:
    """Segment vide → WAV vide : l'ASR ne doit jamais tourner sur du silence."""
    assert mic_frames_to_wav([]) == b""
    assert mic_frames_to_wav([b"", b""]) == b""


def test_wav_to_pcm_rejects_stereo() -> None:
    """Un WAV stéréo est une erreur explicite, pas une conversion silencieuse."""
    import io

    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(24000)
        wf.writeframes(b"\x00\x00" * 100)
    with pytest.raises(AudioFormatError):
        wav_to_pcm(buf.getvalue())


# ── Audio : découpe en trames de publication ──────────────────────────────
def test_wav_to_chunks_are_exactly_100ms() -> None:
    """1 s de WAV 24 k → 10 trames de 100 ms, 2400 échantillons chacune."""
    wav = pcm_to_wav(tone(440.0, 1000.0, TTS_SAMPLE_RATE), TTS_SAMPLE_RATE)
    chunks = wav_to_chunks(wav, TTS_SAMPLE_RATE, frame_ms=100)
    assert len(chunks) == 10
    for c in chunks:
        assert c.samples_per_channel == 2400          # 24000 * 0.1
        assert len(c.data) == 2400 * 2                # 2 octets par échantillon
        assert c.sample_rate == TTS_SAMPLE_RATE
        assert c.num_channels == 1


def test_wav_to_chunks_pads_the_last_frame() -> None:
    """Une queue de 30 ms est complétée : pas de trame de 20 ms qui clique."""
    wav = pcm_to_wav(tone(440.0, 130.0, TTS_SAMPLE_RATE), TTS_SAMPLE_RATE)
    chunks = wav_to_chunks(wav, TTS_SAMPLE_RATE, frame_ms=100)
    assert len(chunks) == 2
    assert all(c.samples_per_channel == 2400 for c in chunks)


def test_wav_to_chunks_rejects_wrong_rate() -> None:
    """TTS à 22 050 Hz alors qu'on publie en 24 k → erreur, pas de pitch faux."""
    wav = pcm_to_wav(tone(440.0, 100.0, 22050), 22050)
    with pytest.raises(AudioFormatError):
        wav_to_chunks(wav, TTS_SAMPLE_RATE, frame_ms=100)


def test_wav_to_chunks_empty_is_empty() -> None:
    assert wav_to_chunks(pcm_to_wav(b"", TTS_SAMPLE_RATE), TTS_SAMPLE_RATE) == []


# ── Protocole : le canal de donnees enfin explicite ──────
def test_protocol_events_round_trip() -> None:
    ev = protocol.agent_text("Bonjour Awa", "t7", final=True)
    assert protocol.decode(protocol.encode(ev)) == ev


def test_protocol_rejects_unknown_state() -> None:
    with pytest.raises(ValueError):
        protocol.agent_state("thinking-hard")


def test_protocol_rejects_unknown_error_code() -> None:
    with pytest.raises(ValueError):
        protocol.agent_error("oops", "quelque chose")


def test_protocol_decode_never_raises_on_garbage() -> None:
    """Un octet illisible du client ne doit pas tuer la boucle vocale."""
    assert protocol.decode(b"\xff\xfe not json") is None
    assert protocol.decode(b"[1,2,3]") is None   # JSON valide, pas un objet
    assert protocol.decode(b'"chaine"') is None


def test_turn_ids_are_unique_and_increasing() -> None:
    ids = [protocol.new_turn_id() for _ in range(50)]
    assert len(set(ids)) == 50
    assert all(int(i[1:]) < int(j[1:]) for i, j in zip(ids, ids[1:]))


# ── Session : le barge-in, enfin réel ─────────────────────────────────────
def _session(**kw) -> VoiceSession:
    defaults = dict(
        transcribe=lambda wav: "je veux mon permis",
        turn=lambda text: "D'accord. Il vous faut 3 pièces.",
        synthesize=lambda text: pcm_to_wav(tone(440.0, 200.0, TTS_SAMPLE_RATE), TTS_SAMPLE_RATE),
        documents_provider=list,
    )
    defaults.update(kw)
    return VoiceSession(**defaults)


def test_turn_produces_text_and_real_audio() -> None:
    """Un tour nominal : transcription PUIS réponse, et un WAV réellement synthétisé."""
    s = _session()
    turn_id = s.enqueue_segment(tone(440.0, 100.0, ASR_SAMPLE_RATE))
    out = s.handle_turn(pcm_to_wav(b"\x00\x00" * 100, ASR_SAMPLE_RATE), turn_id)
    # L'ordre compte : l'usager voit ce qui a été compris avant la réponse.
    assert [e["type"] for e in out["events"]] == [protocol.EV_AGENT_TEXT] * 2
    assert out["events"][0]["role"] == protocol.ROLE_USER
    assert out["events"][0]["text"] == "je veux mon permis"
    assert out["events"][1]["role"] == protocol.ROLE_AGENT
    assert out["events"][1]["text"] == "D'accord. Il vous faut 3 pièces."
    assert out["text"] == "je veux mon permis"
    assert out["reply"] == "D'accord. Il vous faut 3 pièces."
    assert out["audio"][:4] == b"RIFF"  # un vrai WAV, pas un stub


def test_barge_in_kills_an_in_flight_turn() -> None:
    """Le cœur du correctif : interrompu pendant le calcul, le tour ne parle pas."""
    s = _session()
    turn_id = s.enqueue_segment(b"pcm")
    s.interrupt()  # l'usager reparle
    with pytest.raises(_Superseded):
        s.handle_turn(pcm_to_wav(b"\x00\x00" * 10, ASR_SAMPLE_RATE), turn_id)


def test_barge_in_discards_buffered_audio() -> None:
    """L'audio déjà capturé avant le barge-in est périmé : il part à la poubelle."""
    s = _session()
    s.push_audio(tone(440.0, 20.0, MIC_SAMPLE_RATE))
    s.push_audio(tone(440.0, 20.0, MIC_SAMPLE_RATE))
    assert s.buffered_frames == 2
    s.interrupt()
    assert s.buffered_frames == 0
    assert s.flush_segment() is None  # pas d'ASR sur du son périmé


def test_older_turns_never_speak_after_a_new_one_starts() -> None:
    """Deux tours en file : le second annule le premier, définitivement."""
    s = _session()
    first = s.enqueue_segment(b"a")
    second = s.enqueue_segment(b"b")
    assert s.is_superseded(first) is True
    assert s.is_superseded(second) is False
    with pytest.raises(_Superseded):
        s.handle_turn(pcm_to_wav(b"", ASR_SAMPLE_RATE), first)
    # …et le second, lui, parle.
    assert s.handle_turn(pcm_to_wav(b"\x00\x00" * 10, ASR_SAMPLE_RATE), second)["audio"]


def test_asr_failure_yields_honest_error_not_invented_text() -> None:
    """ASR indisponible → code d'erreur. Jamais une réponse vocale fabriquée."""

    class KirikuUnavailableError(RuntimeError):
        pass

    s = _session(transcribe=lambda wav: (_ for _ in ()).throw(KirikuUnavailableError("pas de GPU")))
    turn_id = s.enqueue_segment(b"a")
    out = s.handle_turn(pcm_to_wav(b"\x00\x00" * 10, ASR_SAMPLE_RATE), turn_id)
    assert [e["type"] for e in out["events"]] == [protocol.EV_AGENT_ERROR]
    assert out["events"][0]["code"] == protocol.ERR_ASR_UNAVAILABLE
    assert out["audio"] is None   # aucune réponse inventée
    assert out["reply"] == ""     # rien n'a été formulé du tout
    assert len(s.history) == 0    # rien n'entre dans l'historique non plus


def test_tts_failure_still_delivers_the_real_text() -> None:
    """Pas de voix = dégradation honnête, mais la réponse texte est vraie."""

    class XttsUnavailableError(RuntimeError):
        pass

    s = _session(synthesize=lambda t: (_ for _ in ()).throw(XttsUnavailableError("pas de voix")))
    turn_id = s.enqueue_segment(b"a")
    out = s.handle_turn(pcm_to_wav(b"\x00\x00" * 10, ASR_SAMPLE_RATE), turn_id)
    kinds = [e["type"] for e in out["events"]]
    assert kinds == [protocol.EV_AGENT_TEXT, protocol.EV_AGENT_TEXT, protocol.EV_AGENT_ERROR]
    assert out["events"][-1]["code"] == protocol.ERR_TTS_UNAVAILABLE
    # La réponse TEXTE est partie AVANT l'échec TTS : l'usager n'attend pas le son.
    assert out["events"][1]["role"] == protocol.ROLE_AGENT
    assert out["events"][1]["text"] == "D'accord. Il vous faut 3 pièces."
    assert out["audio"] is None
    # Le texte réellement calculé reste dans l'historique : rien n'est perdu.
    assert s.history[-1] == {"turnId": turn_id, "role": "agent",
                              "text": "D'accord. Il vous faut 3 pièces."}


def test_silence_recognised_is_reported_as_empty_not_invented() -> None:
    """Un segment dont l'ASR ne tire rien ne déclenche pas de réponse imaginée."""
    s = _session(transcribe=lambda wav: "   ")
    turn_id = s.enqueue_segment(b"a")
    out = s.handle_turn(pcm_to_wav(b"\x00\x00" * 10, ASR_SAMPLE_RATE), turn_id)
    assert len(out["events"]) == 1
    assert out["events"][0]["text"] == ""
    assert out["events"][0]["role"] == protocol.ROLE_USER
    assert out["events"][0]["final"] is True
    assert out["reply"] == ""      # aucune réponse inventée pour un silence
    assert out["audio"] is None


def test_turn_failure_still_delivers_the_transcript() -> None:
    """Moteur indisponible : l'usager voit ce qui a été compris, puis l'erreur."""
    s = _session(turn=lambda text: (_ for _ in ()).throw(RuntimeError("moteur indisponible")))
    turn_id = s.enqueue_segment(b"a")
    out = s.handle_turn(pcm_to_wav(b"\x00\x00" * 10, ASR_SAMPLE_RATE), turn_id)
    assert [e["type"] for e in out["events"]] == [
        protocol.EV_AGENT_TEXT, protocol.EV_AGENT_ERROR,
    ]
    assert out["events"][0]["role"] == protocol.ROLE_USER
    assert out["events"][0]["text"] == "je veux mon permis"
    assert out["events"][-1]["code"] == protocol.ERR_TURN_FAILED
    assert out["audio"] is None


def test_turn_failure_error_code_is_stable() -> None:
    """Une exception moteur quelconque est classée `turn_failed` (jamais 500 muet)."""
    s = _session(turn=lambda text: (_ for _ in ()).throw(ValueError("bizarre")))
    turn_id = s.enqueue_segment(b"a")
    out = s.handle_turn(pcm_to_wav(b"\x00\x00" * 10, ASR_SAMPLE_RATE), turn_id)
    assert out["events"][-1]["code"] == protocol.ERR_TURN_FAILED
    assert "bizarre" in out["events"][-1]["message"]


def test_queue_preserves_segment_order() -> None:
    """L'ASR est lent : les segments s'empilent sans être perdus ni permutés."""
    s = _session()
    for chunk in (b"one", b"two", b"three"):
        s.enqueue_segment(chunk)
    assert s.pending_count == 3
    assert [s.next_pending() for _ in range(3)] == [b"one", b"two", b"three"]
    assert s.next_pending() is None


def test_history_records_both_sides_of_the_conversation() -> None:
    """Transcription + réponse : la session est la mémoire de la conversation."""
    s = _session()
    turn_id = s.enqueue_segment(b"a")
    s.handle_turn(pcm_to_wav(b"\x00\x00" * 10, ASR_SAMPLE_RATE), turn_id)
    assert [(h["role"], h["text"]) for h in s.history] == [
        ("user", "je veux mon permis"),
        ("agent", "D'accord. Il vous faut 3 pièces."),
    ]
    assert all(h["turnId"] == turn_id for h in s.history)
