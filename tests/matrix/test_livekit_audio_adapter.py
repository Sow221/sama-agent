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
    runtime.session = _FrameBuffer()
    runtime._buffered = 0
    runtime._buffered_bytes = 0
    runtime._audio_limit_hit = False

    asyncio.run(runtime._read_audio_track(SimpleNamespace(sid="TR_test")))

    assert runtime.session.frames == [b"frame-1", b"frame-2"]
    assert runtime._buffered == 2
    assert runtime._buffered_bytes == len(b"frame-1frame-2")
    assert streams[0].closed is True


def test_audio_buffer_keeps_segments_longer_than_fifty_frames() -> None:
    runtime = main.VoiceRuntime.__new__(main.VoiceRuntime)
    runtime.session = _FrameBuffer()
    runtime._buffered = 0
    runtime._buffered_bytes = 0
    runtime._audio_limit_hit = False
    frame = SimpleNamespace(data=b"\x00\x00" * 480)

    for _ in range(51):
        runtime.on_audio_frame(frame)

    assert runtime._buffered == 51
    assert runtime._buffered_bytes == 51 * 960
    assert runtime._audio_limit_hit is False


def test_attach_reads_tracks_already_subscribed(monkeypatch) -> None:
    streams: list[_FakeAudioStream] = []
    monkeypatch.setattr(main.rtc, "AudioStream", lambda **kwargs: streams.append(_FakeAudioStream(**kwargs)) or streams[-1])

    track = SimpleNamespace(kind=main.rtc.TrackKind.KIND_AUDIO, sid="TR_existing")
    publication = SimpleNamespace(sid="TR_existing", name="microphone", track=track, subscribed=True)
    participant = SimpleNamespace(track_publications={"TR_existing": publication})
    runtime = main.VoiceRuntime.__new__(main.VoiceRuntime)
    runtime.room = _FakeRoom({"user": participant})
    runtime.session = _FrameBuffer()
    runtime._audio_tasks = {}
    runtime._buffered = 0
    runtime._buffered_bytes = 0
    runtime._audio_limit_hit = False

    async def attach_and_drain():
        await runtime.attach()
        await asyncio.gather(*runtime._audio_tasks.values())

    asyncio.run(attach_and_drain())

    assert runtime.session.frames == [b"frame-1", b"frame-2"]
    assert "TR_existing" in runtime._audio_tasks