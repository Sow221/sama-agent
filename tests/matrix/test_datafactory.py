"""Usine à données wolof (doc 11) : WER, contrôle K1, verdicts de l'étalon, calibrage, API."""
from __future__ import annotations

import io
import os
import random
import uuid
import wave

os.environ.setdefault("SAMA_MODE", "deterministic")

import pytest
from fastapi.testclient import TestClient

from agent.api.fastapi import app, require_user
from agent.datafactory import store
from agent.datafactory.roundtrip import voice_roundtrip
from agent.datafactory.wer import normalize, wer
from agent.infrastructure.auth.supabase import AuthContext


def _wav(frames: int = 160) -> bytes:
    out = io.BytesIO()
    with wave.open(out, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16000)
        w.writeframes(b"\x01\x00" * frames)
    return out.getvalue()


# ── WER ────────────────────────────────────────────────────────────────────
def test_normalize_keeps_wolof_letters_and_drops_only_form() -> None:
    assert normalize("Dama BËGG, def sama paaspoor’ !") == ["dama", "bëgg", "def", "sama", "paaspoor"]
    # ë n'est PAS ramené à e : c'est une vraie différence d'orthographe
    assert normalize("bëgg") != normalize("begg")


def test_wer_counts_substitutions_insertions_deletions() -> None:
    ref = "dama bëgg def sama paaspoor"
    assert wer(ref, "Dama bëgg def sama paaspoor.") == 0.0
    assert wer(ref, "dama bëgga def sama paaspoor") == pytest.approx(1 / 5)   # substitution
    assert wer(ref, "dama bëgg def paaspoor") == pytest.approx(1 / 5)         # suppression
    assert wer(ref, "waaw dama bëgg def sama paaspoor") == pytest.approx(1 / 5)  # insertion
    assert wer("", "") == 0.0 and wer("", "mot") == 1.0


# ── K1 : aller-retour de la voix ──────────────────────────────────────────
def test_k1_passes_when_the_voice_comes_back_intact() -> None:
    r = voice_roundtrip("Dama bëgg def sama paaspoor", lambda t: _wav(),
                        lambda wav: "dama bëgg def sama paaspoor")
    assert r.passed and r.wer == 0.0 and r.wav
    assert r.as_check()["passed"] is True


def test_k1_fails_when_the_ear_hears_something_else() -> None:
    r = voice_roundtrip("Dama bëgg def sama paaspoor", lambda t: _wav(),
                        lambda wav: "dama bëgga dem marse")
    assert not r.passed and r.wer > 0.15


def test_k1_never_raises_and_traces_model_failures() -> None:
    def broken_tts(_text):
        raise RuntimeError("GPU indisponible")

    r = voice_roundtrip("Salaam aleekum", broken_tts, lambda wav: "")
    assert not r.passed and r.wav is None and "synthèse" in r.error


# ── Verdicts de l'étalon et calibrage ─────────────────────────────────────
def _fresh_user() -> str:
    return f"etalon-{uuid.uuid4().hex[:8]}"


def test_verdicts_update_status_and_edit_keeps_the_correction(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("SAMA_DATAFACTORY_DIR", str(tmp_path))
    item = store.add_item("AUDIO_TEXT", "Dama begg def sama paaspoor", "test",
                          checks={"K1": {"wer": 0.0}}, auto_pass=True, wav=_wav())
    assert item["hasAudio"] and store.audio_path_of(item["id"]).exists()

    out = store.record_verdict(item["id"], _fresh_user(), "edit", "Dama bëgg def sama paaspoor")
    assert out["status"] == "accepted"
    assert out["textWo"] == "Dama bëgg def sama paaspoor"
    assert out["checks"]["original_text_wo"] == "Dama begg def sama paaspoor"

    with pytest.raises(ValueError):
        store.record_verdict(item["id"], _fresh_user(), "edit", "  ")
    assert store.record_verdict("inconnu", _fresh_user(), "ok") is None


def test_review_queue_mixes_accepted_and_rejected_and_never_repeats(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("SAMA_DATAFACTORY_DIR", str(tmp_path))
    src = f"lot-{uuid.uuid4().hex[:6]}"
    for i in range(7):
        store.add_item("FR_WO", f"phrase acceptée {i} {src}", src, auto_pass=True)
    for i in range(3):
        store.add_item("FR_WO", f"phrase rejetée {i} {src}", src, auto_pass=False)
    user = _fresh_user()
    batch = store.next_for_review(user, n=10, rng=random.Random(1))
    assert len(batch) == 10
    assert any(i["autoPass"] for i in batch) and any(not i["autoPass"] for i in batch)
    for item in batch:
        store.record_verdict(item["id"], user, "ok")
    again = store.next_for_review(user, n=10)
    assert not {i["id"] for i in again} & {i["id"] for i in batch}


def test_agreement_and_precision_decide_if_filters_can_be_trusted(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("SAMA_DATAFACTORY_DIR", str(tmp_path))
    user = _fresh_user()
    # 50 acceptés par le filtre : l'étalon en valide 46 (précision 0,92) ; 10 rejetés, tous « ko ».
    for i in range(50):
        it = store.add_item("FR_WO", f"ok {i} {user}", "calib", auto_pass=True)
        store.record_verdict(it["id"], user, "ok" if i < 46 else "ko")
    for i in range(10):
        it = store.add_item("FR_WO", f"ko {i} {user}", "calib", auto_pass=False)
        store.record_verdict(it["id"], user, "ko")
    s = store.stats(user)
    assert s["judged"] == 60
    assert s["precision"] == pytest.approx(0.92)
    assert s["agreement"] == pytest.approx(56 / 60, abs=1e-3)
    assert s["trusted"] is True  # ≥ 50 jugements et précision ≥ 0,9


# ── API : réservée aux étalons ────────────────────────────────────────────
client = TestClient(app)


def _as(user_id: str, email: str | None = None):
    app.dependency_overrides[require_user] = lambda: AuthContext(user_id=user_id, email=email, provider="test")


def test_api_is_reserved_to_listed_validators(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("SAMA_DATAFACTORY_DIR", str(tmp_path))
    monkeypatch.setenv("SAMA_VALIDATORS", "fondateur@exemple.sn")
    try:
        _as("quelquun", "autre@exemple.sn")
        assert client.get("/api/datafactory/next").status_code == 403

        _as("x1", "Fondateur@exemple.sn")
        item = store.add_item("AUDIO_TEXT", f"Salaam aleekum {uuid.uuid4().hex[:6]}", "api",
                              auto_pass=True, wav=_wav())
        items = client.get("/api/datafactory/next?n=50").json()["items"]
        assert item["id"] in {i["id"] for i in items}
        audio = client.get(f"/api/datafactory/audio/{item['id']}")
        assert audio.status_code == 200 and audio.headers["content-type"] == "audio/wav"
        r = client.post("/api/datafactory/verdict", json={"itemId": item["id"], "verdict": "ok"})
        assert r.status_code == 200 and r.json()["status"] == "accepted"
        bad = client.post("/api/datafactory/verdict", json={"itemId": item["id"], "verdict": "peut-être"})
        assert bad.status_code == 422
        stats = client.get("/api/datafactory/stats").json()
        assert stats["me"]["judged"] >= 1
    finally:
        app.dependency_overrides.pop(require_user, None)
