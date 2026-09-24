"""
Agent LiveKit — la boucle vocale réelle (ADR-004/005).

Flux (tout réel, zéro contenu pré-écrit) :
  client (VAD Silero) ──DataChannel──► this worker
      user_segment / barge_in / cancel
  audio micro ──► ASR Kiriku (wolof) ──► orchestrator (intent → Journey → formulation)
      ──► xTTS wolof ──► track audio publiée dans la room (voix IA réelle).

Structure hexagonale (référence §5) : le worker appelle l'ORCHESTRATEUR applicatif,
jamais le domaine ni les providers directement ici.
"""
from __future__ import annotations

import asyncio
import io
import json
import logging
import os
import struct
import wave

import numpy as np
from livekit import rtc
from livekit.agents import WorkerOptions, cli

from agent import bootstrap  # noqa: F401
from agent.schemas import DocumentAnalysis, JourneyDocument, JourneyRequest
from agent.application.orchestration.agent_orchestrator import voice_turn
from agent.application.use_cases.analyze_document import analyze_document
from agent.application.use_cases.get_journey import get_journey
from agent.infrastructure.stt import asr_kiriku
from agent.infrastructure.tts import tts_xtts

log = logging.getLogger("sama.worker.voice")
logging.basicConfig(level=logging.INFO)

# État réel du dossier côté worker (mémoire de session ; la persistance PostgreSQL arrive
# en Phase PERS via les repositories — l'état serveur devient alors source de vérité).
_DOSSIERS: dict[str, list[JourneyDocument]] = {}


def update_dossier_from_analysis(journey_id: str, analysis: DocumentAnalysis) -> None:
    docs = _DOSSIERS.setdefault(journey_id, [])
    for d in docs:
        if d.requirementId == analysis.requirementId:
            d.status = analysis.status
            return
    docs.append(JourneyDocument(requirementId=analysis.requirementId, status=analysis.status))


def _current_journey(journey_id: str):
    return get_journey(
        JourneyRequest(journeyId=journey_id, documents=_DOSSIERS.get(journey_id))
    )


def _turn(text: str, journey_id: str) -> str:
    """Un tour de la boucle : intent (LLM) → Journey (déterministe) → réponse formulée."""
    return voice_turn(text, journey_id, documents=_DOSSIERS.get(journey_id))


def _frames_to_wav_16k(frames: list[rtc.AudioFrame]) -> bytes:
    """Assemble les frames du segment en un WAV 16 kHz mono réel (entrée ASR Kiriku)."""
    if not frames:
        return b""
    all_raw = b"".join(f.data for f in frames)
    if not all_raw:
        return b""
    samples = np.frombuffer(all_raw, dtype=np.int16).astype(np.float32)
    # Le micro est 48 kHz : on ré-échantillonne réellement vers 16 kHz (décimation simple, phase 1)
    if samples.size > 0:
        step = max(1, round(48000 / 16000))
        samples = samples[::step]
    pcm = samples.astype(np.int16).tobytes()

    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(16000)
        wf.writeframes(pcm)
    return buf.getvalue()


def _wav_to_frames(wav_bytes: bytes, sample_rate: int = 24000) -> list[rtc.AudioFrame]:
    """Découpe le WAV synthétisé en frames (durée 100 ms) pour la publication sur le track."""
    with wave.open(io.BytesIO(wav_bytes), "rb") as wf:
        if wf.getframerate() != sample_rate or wf.getnchannels() != 1:
            raise ValueError(f"attendu {sample_rate} Hz mono, reçu {wf.getframerate()} Hz/{wf.getnchannels()} ch")
        data = wf.readframes(wf.getnframes())
    samples = struct.unpack(f"<{len(data) // 2}h", data)
    frame_size = sample_rate // 10  # 100 ms
    out: list[rtc.AudioFrame] = []
    for i in range(0, len(samples), frame_size):
        chunk = samples[i : i + frame_size]
        if not chunk:
            break
        out.append(
            rtc.AudioFrame(
                data=struct.pack(f"<{len(chunk)}h", *chunk),
                sample_rate=sample_rate,
                num_channels=1,
                samples_per_channel=len(chunk),
            )
        )
    return out


async def entrypoint(ctx: JobContext) -> None:
    await ctx.connect()
    room = ctx.room
    log.info("Room jointe : %s", room.name)

    stop_event = asyncio.Event()
    journey_id = os.getenv("LIVEKIT_ROOM", "sama-demo")
    speaker = os.getenv("XTTS_SPEAKER", "")

    buffer: list[rtc.AudioFrame] = []

    async def play_text(text: str) -> None:
        """Voix IA : xTTS réel → track audio publiée (le client garde le micro actif)."""
        wav = tts_xtts.synthesize(text, speaker)
        frames = _wav_to_frames(wav)
        if not frames:
            return
        source = rtc.AudioSource(sample_rate=24000, num_channels=1)
        track = rtc.LocalAudioTrack.create_audio_track("agent-voice", source)
        pub = await room.local_participant.publish_track(
            track, rtc.TrackPublishOptions(source="voice")
        )
        try:
            for f in frames:
                if stop_event.is_set() or room is None:
                    break
                await source.capture_frame(f)
        finally:
            await source.close()
            try:
                await room.local_participant.unpublish_track(pub.sid)
            except RuntimeError:
                pass

    async def handle_segment() -> None:
        stop_event.clear()
        wav = _frames_to_wav_16k(buffer[:])
        buffer.clear()
        if not wav:
            return
        log.info("segment — ASR (Kiriku)…")
        try:
            text = asr_kiriku.transcribe(wav)
        except Exception as exc:
            log.error("ASR échoué : %s", exc)
            return
        log.info("ASR → %r", text)
        if not text.strip():
            return
        reply = _turn(text, journey_id)
        log.info("réponse → %r", reply)
        await play_text(reply)

    def on_data(data: rtc.DataReceivedEvent) -> None:
        try:
            event = json.loads(data.data.decode())
        except (UnicodeDecodeError, json.JSONDecodeError):
            return
        kind = event.get("type")
        if kind in ("cancel", "barge_in"):
            stop_event.set()
        elif kind == "user_segment":
            asyncio.create_task(handle_segment())

    room.on("data_received", on_data)

    for participant in room.remote_participants.values():
        for _, pub in participant.track_publications.items():
            if pub.kind == rtc.TrackKind.KIND_AUDIO:
                track = await pub.track()

                @track.on("audio_frame")
                def _frame(frame: rtc.AudioFrame) -> None:
                    if len(buffer) < 500:  # fenêtre ~5 s max
                        buffer.append(frame)

    while True:
        await asyncio.sleep(60)


cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))