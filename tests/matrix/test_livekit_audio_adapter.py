from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest

pytest.importorskip("livekit")
pytest.importorskip("livekit.agents")

from agent.voice import main


class _FakeAudioStream:
    def __init__(self, **kwargs) -> None:
        self.frames = [
            SimpleNamespace(frame=SimpleNamespace(data=b"frame-1")),
            SimpleNamespace(frame=SimpleNamespace(data=b"frame-2")),
        ]
        self.closed = False

    def __aiter__(self):
        self._frames = iter(self.frames)
        return self

    async def __anext__(self):
        try:
            return next(self._frames)
        except StopIteration:
            raise StopAsyncIteration

    async def aclose(self):
        self.closed = True


class _FrameBuffer:
    def __init__(self) -> None:
        self.frames: list[bytes] = []

    def push_audio(self, data: bytes) -> None:
        self.frames.append(data)


class _FakeRoom:
    def __init__(self, participants=None) -> None:
        self.handlers = {}
        self.remote_participants = participants or {}

    def on(self, event, handler=None):
        if handler is not None:
            self.handlers[event] = handler
            return handler

        def register(handler):
            self.handlers[event] = handler
            return handler

        return register


def test_audio_track_stream_is_consumed_and_closed(monkeypatch) -> None:
    streams: list[_FakeAudioStream] = []

    def make_stream(**kwargs):
        stream = _FakeAudioStream(**kwargs)
        streams.append(stream)
        return stream

    monkeypatch.setattr(main.rtc, "AudioStream", make_stream)
    runtime = main.VoiceRuntime.__new__(main.VoiceRuntime)
    seen: list[bytes] = []
    runtime.on_audio_frame = lambda frame: seen.append(frame.data)

    asyncio.run(runtime._read_audio_track(SimpleNamespace(sid="TR_test")))

    assert seen == [b"frame-1", b"frame-2"]
    assert streams[0].closed is True


def _pcm(amplitude: int, ms: int = 10, rate: int = 48_000) -> bytes:
    import math
    import struct

    n = rate * ms // 1000
    return b"".join(struct.pack("<h", int(amplitude * math.sin(i / 7.0))) for i in range(n))


def test_server_endpointing_makes_one_turn_per_utterance() -> None:
    """Silence → parole → silence : UN seul tour, avec l'audio de la phrase
    (préécoute comprise). Aucun VAD navigateur n'est nécessaire."""
    from agent.voice.endpoint import Endpointer

    runtime = main.VoiceRuntime.__new__(main.VoiceRuntime)
    runtime.endpointer = Endpointer(sample_rate=48_000)
    runtime._speaking = False
    runtime._stop = asyncio.Event()
    runtime.session = SimpleNamespace(current_turn=None, interrupt=lambda: None)
    sent: list[dict] = []
    turns: list[bytes] = []

    async def send(event):
        sent.append(event)

    async def flush(pcm=None):
        turns.append(pcm)

    runtime.send = send
    runtime.flush_segment = flush

    async def scenario():
        for _ in range(100):
            runtime.on_audio_frame(SimpleNamespace(data=_pcm(40)))      # 1 s de silence
        for _ in range(120):
            runtime.on_audio_frame(SimpleNamespace(data=_pcm(9000)))    # 1,2 s de parole
        for _ in range(100):
            runtime.on_audio_frame(SimpleNamespace(data=_pcm(40)))      # 1 s de silence
        await asyncio.sleep(0)

    asyncio.run(scenario())

    assert len(turns) == 1
    seconds = len(turns[0]) / 2 / 48_000
    assert 1.2 <= seconds <= 2.5
    assert sent and sent[0]["state"] == "listening"


def test_endpointer_ignores_short_noise_and_barges_in_while_speaking() -> None:
    from agent.voice.endpoint import END, START, Endpointer

    ep = Endpointer(sample_rate=48_000)
    events = [ep.feed(_pcm(30)) for _ in range(50)]
    events += [ep.feed(_pcm(9000)) for _ in range(20)]   # 200 ms : un claquement
    events += [ep.feed(_pcm(30)) for _ in range(100)]
    assert [e[0] for e in events if e] == [START]         # début, mais pas d'énoncé
    # Pendant que l'agent parle (strict), un écho résiduel (après annulation d'écho) ne coupe pas…
    assert all(ep.feed(_pcm(700), strict=True) is None for _ in range(30))
    # …mais une vraie voix, oui.
    kinds = [e[0] for e in (ep.feed(_pcm(12000), strict=True) for _ in range(30)) if e]
    assert kinds == [START]
    assert END not in kinds


def test_attach_reads_tracks_already_subscribed(monkeypatch) -> None:
    streams: list[_FakeAudioStream] = []
    monkeypatch.setattr(main.rtc, "AudioStream", lambda **kwargs: streams.append(_FakeAudioStream(**kwargs)) or streams[-1])

    track = SimpleNamespace(kind=main.rtc.TrackKind.KIND_AUDIO, sid="TR_existing")
    publication = SimpleNamespace(sid="TR_existing", name="microphone", track=track, subscribed=True)
    participant = SimpleNamespace(track_publications={"TR_existing": publication})
    runtime = main.VoiceRuntime.__new__(main.VoiceRuntime)
    runtime.room = _FakeRoom({"user": participant})
    runtime._audio_tasks = {}
    seen: list[bytes] = []
    runtime.on_audio_frame = lambda frame: seen.append(frame.data)

    async def attach_and_drain():
        await runtime.attach()
        await asyncio.gather(*runtime._audio_tasks.values())

    asyncio.run(attach_and_drain())

    assert seen == [b"frame-1", b"frame-2"]
    assert "TR_existing" in runtime._audio_tasks

def test_end_of_speech_is_found_despite_constant_background_noise() -> None:
    """Pièce bruyante : le bruit de fond reste au-dessus du seuil absolu, mais
    nettement sous la voix → la fin de phrase doit être détectée en < 1 s."""
    from agent.voice.endpoint import END, START, Endpointer

    ep = Endpointer(sample_rate=48_000)
    events = [ep.feed(_pcm(30)) for _ in range(50)]
    events += [ep.feed(_pcm(9000)) for _ in range(150)]       # 1,5 s de voix
    noise_events = [ep.feed(_pcm(900)) for _ in range(100)]    # 1 s de bruit de fond
    kinds = [e[0] for e in events + noise_events if e]
    assert kinds == [START, END]
    end_at = next(i for i, e in enumerate(noise_events) if e)
    assert end_at * 10 <= 900  # fin détectée en moins de 0,9 s de « silence »


def test_noisy_room_from_the_start_is_calibrated_not_mistaken_for_speech() -> None:
    from agent.voice.endpoint import END, START, Endpointer

    ep = Endpointer(sample_rate=48_000)
    noise = [ep.feed(_pcm(900)) for _ in range(200)]          # 2 s de bruit dès l'ouverture
    assert not any(noise)
    voice = [ep.feed(_pcm(9000)) for _ in range(120)]
    tail = [ep.feed(_pcm(900)) for _ in range(100)]
    assert [e[0] for e in voice + tail if e] == [START, END]
