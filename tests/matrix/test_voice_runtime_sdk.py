"""L'adaptateur LiveKit (`agent/voice/main.py`) confronté au VRAI SDK `livekit.rtc`.

Pourquoi ce test existe
-----------------------
`session.py`, `audio.py` et `protocol.py` sont couverts sans SDK, mais `main.py`
ne l'était pas : trois appels invalides y sont passés inaperçus alors que 132
tests étaient verts —

  * `Room.isdisconnected()` n'existe pas         → l'agent quittait la room au démarrage ;
  * `publish_data(x, rtc.DataPacket_Kind.RELIABLE)` → aucun événement n'atteignait le client ;
  * `TrackPublishOptions(source="voice")`           → aucune voix n'était publiée.

Ici, la room est un double minimal, mais chaque appel est lié (`Signature.bind`)
à la signature RÉELLE de la méthode du SDK : un argument invalide casse le test.
Le tour de parole, lui, est réel (moteur + base, mode deterministic).
"""
from __future__ import annotations

import asyncio
import inspect
import os
import uuid

os.environ.setdefault("SAMA_MODE", "deterministic")

import pytest

rtc = pytest.importorskip("livekit.rtc")
pytest.importorskip("livekit.agents")

from agent.application.use_cases.persist_journey import apply_journey  # noqa: E402
from agent.application.use_cases.process_voice import process_voice_turn  # noqa: E402
from agent.schemas import JourneyRequest  # noqa: E402
from agent.voice import main as voice_main  # noqa: E402
from agent.voice import protocol  # noqa: E402
import enums  # noqa: E402


def _bind(method, *args, **kwargs) -> None:
    """Lève TypeError si l'appel ne correspond pas à la signature réelle du SDK."""
    inspect.signature(method).bind(None, *args, **kwargs)


class _Publication:
    sid = "TR_agent"


class _LocalParticipant:
    def __init__(self) -> None:
        self.data: list[dict] = []
        self.published: list = []

    async def publish_data(self, *args, **kwargs) -> None:
        _bind(rtc.LocalParticipant.publish_data, *args, **kwargs)
        self.data.append(protocol.decode(args[0]))

    async def publish_track(self, *args, **kwargs):
        _bind(rtc.LocalParticipant.publish_track, *args, **kwargs)
        self.published.append(args[1] if len(args) > 1 else kwargs.get("options"))
        return _Publication()

    async def unpublish_track(self, *args, **kwargs) -> None:
        _bind(rtc.LocalParticipant.unpublish_track, *args, **kwargs)


class _Room:
    name = "sama-test"

    def __init__(self, connected_polls: int = 0) -> None:
        self.local_participant = _LocalParticipant()
        self.remote_participants: dict = {}
        self._polls = connected_polls

    def isconnected(self) -> bool:
        _bind(rtc.Room.isconnected)
        self._polls -= 1
        return self._polls >= 0

    def on(self, event, callback=None):
        _bind(rtc.Room.on, event, callback)
        return callback if callback is not None else (lambda fn: fn)


class _Ctx:
    def __init__(self, room: _Room) -> None:
        self.room = room


def _runtime(room: _Room, journey_id: str = "driving_license_new") -> voice_main.VoiceRuntime:
    return voice_main.VoiceRuntime(_Ctx(room), journey_id)


def test_sdk_room_api_used_by_the_worker_exists() -> None:
    """Les méthodes appelées par main.py existent dans le SDK installé."""
    assert hasattr(rtc.Room, "isconnected")
    assert not hasattr(rtc.Room, "isdisconnected")
    assert hasattr(rtc.TrackSource, "SOURCE_MICROPHONE")


def test_send_reaches_the_client_with_the_real_signature() -> None:
    room = _Room()
    asyncio.run(_runtime(room).send(protocol.agent_state(protocol.ST_LISTENING)))
    assert room.local_participant.data == [protocol.agent_state(protocol.ST_LISTENING)]


def test_run_stays_in_the_room_while_connected() -> None:
    """`run()` annonce « listening » et reste tant que la room est connectée."""
    room = _Room(connected_polls=1)
    rt = _runtime(room)

    async def _go() -> None:
        await rt.attach()
        await asyncio.wait_for(rt.run(), timeout=5)

    asyncio.run(_go())
    assert room.local_participant.data[0]["state"] == protocol.ST_LISTENING
    assert room._polls < 0  # la boucle a bien interrogé isconnected() jusqu'au bout


def test_publish_uses_a_valid_track_source() -> None:
    """La voix de l'agent est publiée avec un TrackSource valide (pas « voice »)."""
    from agent.voice import audio

    room = _Room()
    rt = _runtime(room)
    wav = audio.pcm_to_wav(b"\x00\x00" * (audio.TTS_SAMPLE_RATE // 5), audio.TTS_SAMPLE_RATE)
    turn_id = rt.session.enqueue_segment(b"x")
    asyncio.run(rt._publish(wav, turn_id))
    options = room.local_participant.published[0]
    assert options.source == rtc.TrackSource.SOURCE_MICROPHONE


def test_voice_turn_reads_a_per_user_journey_from_the_database() -> None:
    """Un dossier par-usager (`<procédure>-<id>`) est relu en base, pas pris pour
    une procédure (avant : KeyError « procédure inconnue » à chaque tour)."""
    jid = f"driving_license_new-{uuid.uuid4().hex[:8]}"
    apply_journey(JourneyRequest(journeyId=jid, procedureId="driving_license_new"))
    reply = process_voice_turn("je veux mon permis de conduire", jid)
    assert reply  # formulé depuis l'état réel du moteur
    assert reply != "Pouvez-vous préciser votre demande ?"


def test_voice_turn_on_unknown_journey_fails_explicitly() -> None:
    with pytest.raises(KeyError):
        process_voice_turn("je veux mon permis", f"inconnu-{uuid.uuid4().hex[:8]}")


def test_runtime_turn_uses_the_persisted_dossier() -> None:
    jid = f"driving_license_new-{uuid.uuid4().hex[:8]}"
    journey = apply_journey(JourneyRequest(journeyId=jid, procedureId="driving_license_new"))
    assert journey.status == enums.JourneyStatus.NEEDS_DOCUMENT
    assert _runtime(_Room(), jid)._turn("permis de conduire")


def test_formulation_names_the_real_pieces() -> None:
    """La réponse (texte et voix) nomme les pièces réelles et suit la priorité du moteur."""
    from agent.application.dialogue import formulate
    from agent.application.use_cases.get_journey import get_journey

    def say(docs):
        return formulate(get_journey(JourneyRequest(
            journeyId="driving_license_new", procedureId="driving_license_new", documents=docs)))

    empty = say(None)
    assert "Pièce d'identité" in empty and "Photographies" in empty and "0 sur 3" in empty
    review = say([{"requirementId": "identity", "status": "NEEDS_REVIEW"}])
    assert "« Pièce d'identité »" in review and "vérifiée" in review
    ready = say([{"requirementId": r, "status": "ANALYZED"} for r in ("identity", "medical", "photos")])
    assert "complet" in ready and "3 pièces sur 3" in ready


def test_edge_tts_streams_into_memory_buffer(monkeypatch) -> None:
    """edge-tts 7.x : `save()` exige un chemin (open(path)). Un tampon mémoire y
    levait TypeError → l'agent ne parlait jamais. On lit le flux `stream()`."""
    import io
    import edge_tts
    from agent.infrastructure.tts import tts_edge

    class _FakeCommunicate:
        def __init__(self, text, voice):
            self.text = text

        async def stream(self):
            yield {"type": "audio", "data": b"ID3"}
            yield {"type": "WordBoundary", "offset": 0}
            yield {"type": "audio", "data": b"-mp3"}

    monkeypatch.setattr(edge_tts, "Communicate", _FakeCommunicate)
    out = io.BytesIO()
    tts_edge._synthesize_async("bonjour", "fr-FR-DeniseNeural", out)
    assert out.getvalue() == b"ID3-mp3"


def test_worker_shares_one_asr_model_across_sessions() -> None:
    """Sessions en THREAD (un seul Kiriku en VRAM) et seuil de charge relevé."""
    from livekit.agents import JobExecutorType

    opts = voice_main.worker_options()
    assert opts.job_executor_type == JobExecutorType.THREAD
    assert opts.load_threshold >= 0.9
