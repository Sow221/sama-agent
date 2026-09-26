"""Non-régression des bloqueurs P0 corrigés (phase 1 du backlog).

Chaque test de ce fichier existait sous la forme d'un bug *silencieux* : le code
semblait correct à la lecture, et rien ne le signalait à l'exécution. Ils sont donc
écrits pour échouer sur l'ancien code, pas seulement pour passer sur le nouveau.

  1. `enums.Language.FR` (membres réels : fr/wo) → AttributeError → HTTP 503 sur
     TOUTE demande d'intent sans langue. Symptôme observé en logs :
     « type object 'Language' has no attribute 'FR' ».
  2. Room vocale partagée `sama-demo` : l'agent essayait de charger la procédure
     « sama-demo » → KeyError. Le nom de room est désormais un encodage réversible
     du dossier, et la route refuse de signer un jeton sans dossier réel.
  3. Repli silencieux sur les clés LiveKit `devkey`/`devsecret` en production :
     un déploiement mal configuré répondait 200 avec des identifiants publics.
  4. `NEXT_ACTION_CHANGED` : l'ancien statut était lu APRÈS affectation, donc la
     comparaison était toujours fausse et l'événement d'audit ne partait jamais.
"""
from __future__ import annotations

import contextlib
import os
import time
import uuid

os.environ.setdefault("SAMA_MODE", "deterministic")
os.environ.setdefault("SAMA_DATABASE_URL", "sqlite://")
os.environ.setdefault("SUPABASE_JWT_SECRET", "test-secret-jwt-tok-0123456789abcdef0123456789abcdef")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from agent import bootstrap  # noqa: F401  (prépare le sys.path)
from agent import mode as app_mode
from agent.api import fastapi as api
from agent.api.fastapi import app
from agent.application.use_cases.persist_journey import apply_journey
from agent.application.use_cases.process_intent import infer_intent
from agent.domain.naming import journey_id_of, room_name
from agent.infrastructure.db.engine import db_session, ensure_ready
from agent.infrastructure.db.models import AuditEvent
from agent.schemas import IntentRequest, JourneyRequest
import enums

client = TestClient(app)
ensure_ready()


@contextlib.contextmanager
def _live(monkeypatch: pytest.MonkeyPatch):
    """Bascule réellement en mode `live` (mode() est mémoïsé : le cache saute)."""
    monkeypatch.setenv("SAMA_MODE", "live")
    monkeypatch.setattr(api, "_RATELIMIT", {})  # on isole la cause du 503
    app_mode.mode.cache_clear()
    try:
        yield
    finally:
        app_mode.mode.cache_clear()


# ── 1. Langue : les membres de l'énumération sont fr/wo, pas FR/WO ─────────
def test_clarification_without_language_uses_real_enum_member() -> None:
    """Une demande d'intent SANS langue ne doit pas lever (503 avant correction)."""
    resp = infer_intent(IntentRequest(transcript="bonjour"))
    assert resp.language == enums.Language.fr
    assert resp.needsClarification is True
    # Le membre réellement déclaré par l'énumération — pas une invention du test.
    assert [m.name for m in enums.Language] == ["fr", "wo"]


def test_clarification_honours_explicit_wolof() -> None:
    """Wolof demandé explicitement → wolof rendu (le repli fr/wo est respecté)."""
    resp = infer_intent(IntentRequest(transcript="nandé", language=enums.Language.wo))
    assert resp.language == enums.Language.wo


def test_intent_route_survives_missing_language() -> None:
    """Le 503 « Language has no attribute 'FR' » ne doit plus exister (route réelle)."""
    r = client.post("/api/intent", json={"transcript": "je veux faire mon permis"})
    assert r.status_code == 200, r.text
    assert r.json()["language"] == "fr"


# ── 2. Room vocale : encodage réversible du dossier ───────────────────────
@pytest.mark.parametrize("jid", [
    "driving_license_new",
    "driving_license_new-4f2a9c81",
    "parcours/avec espace",
    "dossier accentué-éàü",
    "a" * 120,
    "sama-demo",
    "sig=il&autre",
])
def test_room_name_round_trip(jid: str) -> None:
    """room_name ∘ journey_id_of = identité (l'agent relit ce que l'API a écrit)."""
    room = room_name(jid)
    assert journey_id_of(room) == jid
    # LiveKit n'accepte que [A-Za-z0-9_-=] : l'encodage doit le respecter.
    assert all(c.isalnum() or c in "-_=" for c in room), room
    assert len(room.encode("utf-8")) <= 128


def test_room_name_utf8_is_escaped_per_byte() -> None:
    """Les accents font 2 octets UTF-8 : échapper par octet, pas par caractère."""
    assert room_name("é") == "sama-=c3=a9"
    assert journey_id_of("sama-=c3=a9") == "é"


def test_room_name_is_injective() -> None:
    """Deux dossiers distincts ne doivent jamais partager une room (pas de fuite)."""
    a, b = "dossier/a", "dossier=2fa"
    assert a != b
    assert room_name(a) != room_name(b)
    assert journey_id_of(room_name(a)) == a
    assert journey_id_of(room_name(b)) == b


def test_foreign_or_corrupt_room_has_no_journey() -> None:
    """Une room tierce ou corrompue → aucun dossier, et JAMAIS d'exception."""
    assert journey_id_of("some-other-room") is None
    assert journey_id_of("") is None
    assert journey_id_of("sama-") is None
    assert journey_id_of("sama-=zz") is None       # hex non décodable
    assert journey_id_of("sama-=c") is None        # échappement tronqué
    assert journey_id_of("sama-=ff") is None       # octet UTF-8 invalide


def test_empty_journey_id_refused() -> None:
    """Pas de dossier → pas de room silenceuse : ValueError explicite."""
    with pytest.raises(ValueError):
        room_name("   ")


def test_oversized_journey_id_refused_not_truncated() -> None:
    """Trop long pour LiveKit → erreur. Une room tronquée perdrait le dossier."""
    with pytest.raises(ValueError):
        room_name("é" * 100)


def test_voice_token_carries_real_journey() -> None:
    """Le jeton nomme le dossier réel — plus de room partagée `sama-demo`."""
    jid = f"voice_{uuid.uuid4().hex[:10]}"
    client.post("/api/journey", json={"journeyId": jid, "procedureId": "driving_license_new"})

    r = client.post("/api/voice/token", json={"journeyId": jid})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["journeyId"] == jid
    assert body["room"] == room_name(jid)
    assert journey_id_of(body["room"]) == jid
    assert body["room"] != "sama-demo"
    assert body["token"] and body["url"]
    # L'identité est l'usager authentifié, pas un aléa : le worker sait qui parle.
    assert body["identity"].startswith("awa-")


def test_voice_token_defaults_to_users_latest_journey() -> None:
    """Sans dossier demandé, l'API reprend le dossier de l'usager (jamais un room)."""
    jid = f"voice_auto_{uuid.uuid4().hex[:10]}"
    client.post("/api/journey", json={"journeyId": jid, "procedureId": "driving_license_new"})
    r = client.post("/api/voice/token", json={})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["journeyId"] == jid
    assert journey_id_of(body["room"]) == jid


def test_voice_token_honours_explicit_journey() -> None:
    """Un dossier peut être demandé explicitement (multi-dossier)."""
    a, b = f"voice_a_{uuid.uuid4().hex[:8]}", f"voice_b_{uuid.uuid4().hex[:8]}"
    client.post("/api/journey", json={"journeyId": a, "procedureId": "driving_license_new"})
    client.post("/api/journey", json={"journeyId": b, "procedureId": "driving_license_new"})
    r = client.post("/api/voice/token", json={"journeyId": a})
    assert r.status_code == 200, r.text
    assert r.json()["journeyId"] == a
    assert r.json()["room"] == room_name(a)


def test_voice_token_without_journey_is_409_not_a_fake_room() -> None:
    """Aucun dossier → 409 explicite. Jamais un jeton vers une room fantôme."""
    r = client.post("/api/voice/token", json={"journeyId": "   "})
    assert r.status_code == 409, r.text
    assert "dossier" in r.json()["detail"]


def test_voice_token_oversized_journey_is_422() -> None:
    """Un dossier trop long pour LiveKit est refusé explicitement, pas tronqué."""
    r = client.post("/api/voice/token", json={"journeyId": "é" * 100})
    assert r.status_code == 422, r.text


# ── 3. Pas de repli silencieux sur les clés LiveKit publiques ──────────────
# Clé de test uniquement — jamais un secret de production, jamais commité.
_TEST_LIVEKIT_KEY = "APIkeytest0000000000000000000000000"
_TEST_LIVEKIT_SECRET = "fixture-" + "x" * 40


def _auth_header(user_id: str = "a2b3c4d5-0000-0000-0000-0000000000ff") -> dict:
    """Un VRAI jeton Supabase (HS256) — en `live`, l'API n'accepte rien d'autre."""
    import jwt

    token = jwt.encode(
        {
            "sub": user_id,
            "aud": "authenticated",
            "exp": int(time.time()) + 3600,
            "email": "awa@sama.sn",
            "app_metadata": {"provider": "email"},
        },
        os.environ["SUPABASE_JWT_SECRET"],
        algorithm="HS256",
    )
    return {"Authorization": f"Bearer {token}"}


def test_live_mode_refuses_devkeys(monkeypatch: pytest.MonkeyPatch) -> None:
    """En `live`, clés absentes = 503 explicite (avant : 200 signé par devkey)."""
    jid = f"live_{uuid.uuid4().hex[:10]}"
    with _live(monkeypatch):
        client.post("/api/journey", json={"journeyId": jid, "procedureId": "driving_license_new"},
                    headers=_auth_header())
        monkeypatch.delenv("LIVEKIT_API_KEY", raising=False)
        monkeypatch.delenv("LIVEKIT_API_SECRET", raising=False)
        r = client.post("/api/voice/token", json={"journeyId": jid}, headers=_auth_header())
    assert r.status_code == 503, r.text
    assert "LIVEKIT_API_KEY" in r.json()["detail"]


def test_live_mode_refuses_published_devkeys(monkeypatch: pytest.MonkeyPatch) -> None:
    """`devkey`/`devsecret` présents dans l'env sont traités comme non configurés."""
    jid = f"devkey_{uuid.uuid4().hex[:10]}"
    with _live(monkeypatch):
        client.post("/api/journey", json={"journeyId": jid, "procedureId": "driving_license_new"},
                    headers=_auth_header())
        monkeypatch.setenv("LIVEKIT_API_KEY", "devkey")
        monkeypatch.setenv("LIVEKIT_API_SECRET", "devsecret")
        r = client.post("/api/voice/token", json={"journeyId": jid}, headers=_auth_header())
    assert r.status_code == 503, r.text


def test_live_mode_signs_with_real_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    """Avec de vraies clés, le jeton est signé et nomme le dossier (pas de régression)."""
    jid = f"realkey_{uuid.uuid4().hex[:10]}"
    with _live(monkeypatch):
        client.post("/api/journey", json={"journeyId": jid, "procedureId": "driving_license_new"},
                    headers=_auth_header())
        monkeypatch.setenv("LIVEKIT_API_KEY", _TEST_LIVEKIT_KEY)
        monkeypatch.setenv("LIVEKIT_API_SECRET", _TEST_LIVEKIT_SECRET)
        r = client.post("/api/voice/token", json={"journeyId": jid}, headers=_auth_header())
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["journeyId"] == jid
        assert len(body["token"]) > 40
        # L'identité est celle de l'usager authentifié, pas un aléa.
        assert "a2b3c4d5-0000-0000-0000-0000000000ff" in body["identity"]
        # Le TTL demandé est porté par le jeton et echoed (borne 24 h).
        assert body["ttl"] == 3600
        r2 = client.post("/api/voice/token", json={"journeyId": jid, "ttl": 999999},
                         headers=_auth_header())
        assert r2.json()["ttl"] == 24 * 3600


def test_live_mode_refuses_another_users_journey(monkeypatch: pytest.MonkeyPatch) -> None:
    """Un usager ne peut pas obtenir de token pour le dossier d'un autre."""
    other = f"owned_{uuid.uuid4().hex[:10]}"
    owner_header = _auth_header()
    stranger_header = _auth_header("b3c4d5e6-0000-0000-0000-0000000000aa")
    with _live(monkeypatch):
        created = client.post(
            "/api/journey",
            json={"journeyId": other, "procedureId": "driving_license_new"},
            headers=owner_header,
        )
        assert created.status_code == 200, created.text
        monkeypatch.setenv("LIVEKIT_API_KEY", _TEST_LIVEKIT_KEY)
        monkeypatch.setenv("LIVEKIT_API_SECRET", _TEST_LIVEKIT_SECRET)
        r = client.post("/api/voice/token", json={"journeyId": other}, headers=stranger_header)
        resume = client.get(f"/api/journey/{other}", headers=stranger_header)
    assert r.status_code == 404, r.text
    assert resume.status_code == 404, resume.text


# ── 4. Audit NEXT_ACTION_CHANGED : il doit réellement partir ───────────────
def test_next_action_changed_audit_fires_on_status_transition() -> None:
    """Une transition de statut produit UN événement d'audit (jamais 0, jamais 2)."""
    jid = f"audit_{uuid.uuid4().hex[:10]}"
    # 1er état : tout manque → NEEDS_DOCUMENT
    apply_journey(JourneyRequest(journeyId=jid, procedureId="driving_license_new"))
    # 2e état : un document suspect → NEEDS_REVIEW (transition réelle)
    apply_journey(JourneyRequest(
        journeyId=jid, procedureId="driving_license_new",
        documents=[{"requirementId": "identity", "status": "NEEDS_REVIEW"}],
    ))

    with db_session() as session:
        rows = session.execute(
            select(AuditEvent).where(
                AuditEvent.journey_id == jid,
                AuditEvent.event_type == "NEXT_ACTION_CHANGED",
            ).order_by(AuditEvent.created_at)
        ).scalars().all()

    assert len(rows) == 1, f"attendu 1 événement, obtenu {len(rows)}"
    payload = rows[0].payload or {}
    assert payload.get("to") == enums.JourneyStatus.NEEDS_REVIEW.value
    assert payload.get("from") == enums.JourneyStatus.NEEDS_DOCUMENT.value
    assert payload.get("from") != payload.get("to")


def test_next_action_changed_not_duplicated_on_identical_state() -> None:
    """Même statut deux fois → pas de faux événement (l'audit reste un signal)."""
    jid = f"audit_same_{uuid.uuid4().hex[:10]}"
    req = JourneyRequest(journeyId=jid, procedureId="driving_license_new")
    apply_journey(req)
    apply_journey(req)
    with db_session() as session:
        n = session.execute(
            select(AuditEvent).where(
                AuditEvent.journey_id == jid,
                AuditEvent.event_type == "NEXT_ACTION_CHANGED",
            )
        ).scalars().all()
    assert len(n) == 0
