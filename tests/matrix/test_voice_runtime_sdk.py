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
    # Formulé depuis l'état réel du moteur : affiché en français, dit en wolof.
    assert "Pièce d'identité" in reply.display
    assert reply.spoken and "kàrtu identite" in reply.spoken


def test_voice_turn_without_journey_is_a_free_conversation() -> None:
    """Room sans dossier : pas de crash, pas d'état inventé (déterministe : précision)."""
    reply = process_voice_turn("bonjour", f"libre-{uuid.uuid4().hex[:8]}")
    assert reply.display and reply.spoken is None


def test_runtime_turn_uses_the_persisted_dossier() -> None:
    jid = f"driving_license_new-{uuid.uuid4().hex[:8]}"
    journey = apply_journey(JourneyRequest(journeyId=jid, procedureId="driving_license_new"))
    assert journey.status == enums.JourneyStatus.NEEDS_DOCUMENT
    display, reply = _runtime(_Room(), jid)._turn("permis de conduire")
    # À l'écran : le wolof (ce qui est dit) d'abord, puis le français.
    assert reply.spoken and display == f"{reply.spoken}\n\n{reply.display}"


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


# ── Voix wolof (alternatives à xTTS GalsenAI) ───────────────────────────────
def test_wolof_phrase_follows_the_engine() -> None:
    from agent.application.dialogue import formulate_wolof
    from agent.application.use_cases.get_journey import get_journey

    def say(docs):
        return formulate_wolof(get_journey(JourneyRequest(
            journeyId="driving_license_new", procedureId="driving_license_new", documents=docs)))

    assert "kàrtu identite bi" in say(None) and "nataal yi" in say(None)
    assert "Fàww ñu seet kàrtu identite bi" in say([{"requirementId": "identity", "status": "NEEDS_REVIEW"}])
    ready = say([{"requirementId": r, "status": "ANALYZED"} for r in ("identity", "medical", "photos")])
    assert "ñett ci ñett" in ready  # nombres en lettres : un TTS lit mal les chiffres


def test_reply_is_spoken_in_wolof_first_then_french(monkeypatch) -> None:
    from agent import mode as app_mode
    from agent.infrastructure import tts
    from agent.infrastructure.tts import tts_wolof

    monkeypatch.setattr(app_mode, "is_live", lambda: True)
    said = []
    monkeypatch.setattr(tts, "synthesize", lambda text, speaker_wav=None: said.append(text) or b"FR")

    monkeypatch.setattr(tts_wolof, "synthesize", lambda text: (b"WO:" + text.encode(), "adia"))
    assert tts.synthesize_reply("Il manque", "Dafa des") == (b"WO:Dafa des", "wo")

    def down(text):
        raise tts_wolof.WolofTtsUnavailableError("pas de GPU")

    monkeypatch.setattr(tts_wolof, "synthesize", down)
    # Repli : c'est la phrase FRANÇAISE qui est lue, jamais du wolof en voix française.
    assert tts.synthesize_reply("Il manque", "Dafa des") == (b"FR", "fr")
    assert said == ["Il manque"]


def test_wolof_engine_order_and_fallback(monkeypatch) -> None:
    from agent.infrastructure.tts import tts_wolof

    class _Ok(tts_wolof._Engine):
        name = "ok"
        def _load(self):
            return "model"
        def _synth(self, model, text):
            return b"WAV"

    class _Ko(tts_wolof._Engine):
        name = "ko"
        def _load(self):
            raise RuntimeError("poids introuvables")

    monkeypatch.setattr(tts_wolof, "ENGINES", {"adia": _Ko(), "mms": _Ok()})
    monkeypatch.setenv("SAMA_TTS_WOLOF", "adia,mms")
    assert tts_wolof.synthesize("Dafa des") == (b"WAV", "mms")
    monkeypatch.setenv("SAMA_TTS_WOLOF", "off")
    with pytest.raises(tts_wolof.WolofTtsUnavailableError):
        tts_wolof.synthesize("Dafa des")


def test_wolof_waveform_is_converted_to_worker_format() -> None:
    import math

    from agent.infrastructure.tts.tts_wolof import _float_to_wav
    from agent.voice import audio

    sine = [0.5 * math.sin(2 * math.pi * 440 * i / 16_000) for i in range(16_000)]
    pcm, rate = audio.wav_to_pcm(_float_to_wav(sine, 16_000))
    assert rate == audio.TTS_SAMPLE_RATE and abs(len(pcm) // 2 - 24_000) < 50


def test_session_displays_french_and_speaks_the_reply_object() -> None:
    from agent.voice.session import VoiceSession

    spoken = []
    session = VoiceSession(
        transcribe=lambda wav: "sama permis",
        turn=lambda text: ("Il manque la pièce.", {"wo": "Dafa des"}),
        synthesize=lambda speech: spoken.append(speech) or b"RIFF",
    )
    turn_id = session.enqueue_segment(b"x")
    result = session.handle_turn(b"wav", turn_id)
    texts = [e["text"] for e in result["events"] if e["type"] == "agent_text"]
    assert texts == ["sama permis", "Il manque la pièce."]
    assert spoken == [{"wo": "Dafa des"}]


# ── Adia phrase par phrase (latence perçue, même voix, jamais de mélange) ───
def test_split_sentences_keeps_short_natural_units() -> None:
    from agent.infrastructure.tts.tts_wolof import split_sentences

    parts = split_sentences("Dafa des kàrtu identite bi ak nataal yi. Tàmbalil ak kàrtu identite bi.")
    assert parts == ["Dafa des kàrtu identite bi ak nataal yi.", "Tàmbalil ak kàrtu identite bi."]
    assert split_sentences("Waaw. Baax na.") == ["Waaw. Baax na."]  # pas de micro-phrase isolée
    assert all(len(p) <= 180 for p in split_sentences("wax " * 200))


def _stream(monkeypatch, wolof_impl):
    from agent import mode as app_mode
    from agent.infrastructure import tts
    from agent.infrastructure.tts import tts_wolof

    monkeypatch.setattr(app_mode, "is_live", lambda: True)
    monkeypatch.setattr(tts, "synthesize", lambda text, speaker_wav=None: b"FR:" + text.encode())
    monkeypatch.setattr(tts_wolof, "synthesize", wolof_impl)
    return list(tts.stream_reply("Il manque des pièces.", "Dafa des nataal yi ak kàrtu bi. Tàmbalil ak kàrtu bi."))


def test_stream_reply_speaks_wolof_sentence_by_sentence_with_one_voice(monkeypatch) -> None:
    engines = []

    def ok(text, only=None):
        engines.append(only)
        return b"WO:" + text.encode(), "adia"

    out = _stream(monkeypatch, ok)
    assert [lang for _, lang in out] == ["wo", "wo"]
    assert engines == [None, "adia"]  # 2e phrase imposée au moteur de la 1re : même voix


def test_stream_reply_falls_back_to_french_only_if_first_sentence_fails(monkeypatch) -> None:
    from agent.infrastructure.tts import tts_wolof

    def down(text, only=None):
        raise tts_wolof.WolofTtsUnavailableError("GPU")

    assert _stream(monkeypatch, down) == [(b"FR:Il manque des pi\xc3\xa8ces.", "fr")]

    calls = {"n": 0}

    def breaks_later(text, only=None):
        calls["n"] += 1
        if calls["n"] == 2:
            raise tts_wolof.WolofTtsUnavailableError("coupure")
        return b"WO", "adia"

    # Panne en cours de réponse : on s'arrête, sans enchaîner en français (pas de mélange).
    assert [lang for _, lang in _stream(monkeypatch, breaks_later)] == ["wo"]


def test_speak_publishes_all_sentences_on_one_track() -> None:
    from agent.voice import audio

    room = _Room()
    rt = _runtime(room)
    wav = audio.pcm_to_wav(b"\x00\x00" * (audio.TTS_SAMPLE_RATE // 10), audio.TTS_SAMPLE_RATE)
    turn_id = rt.session.enqueue_segment(b"x")
    asyncio.run(rt._speak(iter([wav, wav]), turn_id))
    states = [e.get("state") for e in room.local_participant.data if e["type"] == "agent_state"]
    assert states == [protocol.ST_SPEAKING, protocol.ST_LISTENING]
    assert len(room.local_participant.published) == 1  # une seule piste pour toute la réponse


def test_speak_reports_voice_failure_honestly() -> None:
    room = _Room()
    rt = _runtime(room)
    turn_id = rt.session.enqueue_segment(b"x")

    def broken():
        raise RuntimeError("Adia non chargé")
        yield b""  # noqa: unreachable — générateur

    asyncio.run(rt._speak(broken(), turn_id))
    kinds = [(e["type"], e.get("code") or e.get("state")) for e in room.local_participant.data]
    assert kinds == [("agent_error", protocol.ERR_TTS_UNAVAILABLE), ("agent_state", protocol.ST_LISTENING)]
    assert room.local_participant.published == []  # jamais « je parle » sans voix


def test_voice_reply_parses_markdown_fr_wo_lines(monkeypatch) -> None:
    """Le LLM met souvent du gras (« **FR :** ») : la ligne wolof doit être retrouvée,
    sinon l'agent n'a rien à dire à voix haute."""
    import agent.application.use_cases.process_voice as pv
    import agent.infrastructure.web.search as search

    class _Llm:
        model = "fake"

        def chat_text(self, messages, max_tokens=300):
            return "**FR :** Allez à la police avec votre extrait.\n**WO :** Demal ci polis ak sa extrait."

    monkeypatch.setattr(search, "web_search", lambda *a, **k: [])
    import agent.infrastructure.llm.glm as glm
    monkeypatch.setattr(glm, "GlmLlm", lambda *a, **k: _Llm())
    reply = pv._llm_voice_reply("sama passeport dafa réer", None, [])
    assert reply.display == "Allez à la police avec votre extrait."
    assert reply.spoken == "Demal ci polis ak sa extrait."
