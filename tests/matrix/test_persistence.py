"""
Persistance (PERS, référence §7.3) — PostgreSQL cible, SQLite en mémoire dans les tests.

La source de vérité est le serveur (journeys + journey_requirements) :
  · POST /api/journey persiste l'état dérivé,
  · GET /api/journey/{id} (resume) le relit et le re-dérive (jamais l'historique),
  · chaque analyse persiste documents + observations + audit,
  · chaque appel d'outil est tracé (tool_calls).
"""
from __future__ import annotations

import os
import uuid

os.environ.setdefault("SAMA_MODE", "deterministic")

from fastapi.testclient import TestClient
from sqlalchemy import select

from agent.api.fastapi import app
from agent.infrastructure.db.engine import ensure_ready
from agent.infrastructure.db.models import (
    AuditEvent,
    Requirement,
    Source,
    ToolCall,
)
from agent.tools import execute_tool
import enums

client = TestClient(app)

ensure_ready()


def _jid() -> str:
    return f"persist_{uuid.uuid4().hex[:10]}"


def _post_journey(journey_id: str, documents: list[dict] | None = None):
    payload: dict = {"journeyId": journey_id, "procedureId": "driving_license_new"}
    if documents:
        payload["documents"] = documents
    return client.post("/api/journey", json=payload)


def test_seed_present_procedure_and_sources() -> None:
    """Le seed idempotent charge la procédure, ses exigences et la source officielle (C §66)."""
    with client:
        pass  # garantit l'init au besoin
    from agent.infrastructure.db.engine import db_session

    with db_session() as s:
        reqs = s.execute(select(Requirement).where(Requirement.required.is_(True))).scalars().all()
        assert {r.code for r in reqs} == {"identity", "medical", "photos"}
        assert s.get(Source, "capp_karangue") is not None
        assert s.get(Source, "src-identity") is not None


def test_apply_then_resume_same_state() -> None:
    """Rechargement volontaire : GET resume relit le serveur et rend le MÊME état."""
    jid = _jid()
    docs = [
        {"requirementId": "identity", "status": "ANALYZED"},
        {"requirementId": "medical", "status": "ANALYZED"},
        {"requirementId": "photos", "status": "ANALYZED"},
    ]
    r = _post_journey(jid, docs)
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == enums.JourneyStatus.READY_FOR_NEXT_STEP
    assert body["nextAction"] == enums.NextAction.CONTACT_SERVICE

    resumed = client.get(f"/api/journey/{jid}")
    assert resumed.status_code == 200, resumed.text
    rb = resumed.json()
    assert rb["status"] == enums.JourneyStatus.READY_FOR_NEXT_STEP
    assert rb["nextAction"] == enums.NextAction.CONTACT_SERVICE
    assert {d["requirementId"] for d in rb["documents"]} == {"identity", "medical", "photos"}
    assert all(d["status"] == enums.DocumentStatus.ANALYZED for d in rb["documents"])


def test_resume_unknown_is_404() -> None:
    r = client.get(f"/api/journey/{_jid()}")
    assert r.status_code == 404


def test_analysis_persists_and_resume_reflects_it() -> None:
    """Une analyse persistée alimente le dossier : resume la montre (source de vérité serveur)."""
    jid = _jid()
    _post_journey(jid)  # dossier vierge → 3 MISSING
    r = client.post(
        "/api/documents/analyze",
        data={"requirementId": "identity", "journeyId": jid},
        files={"file": ("notes.txt", b"pas une image", "text/plain")},
    )
    assert r.status_code == 200
    assert r.json()["status"] == enums.DocumentStatus.NEEDS_REVIEW

    resumed = client.get(f"/api/journey/{jid}").json()
    identity = next(d for d in resumed["documents"] if d["requirementId"] == "identity")
    assert identity["status"] == enums.DocumentStatus.NEEDS_REVIEW
    # Un document suspect prime : le parcours ne paraît jamais plus prêt que la vérité.
    assert resumed["status"] == enums.JourneyStatus.NEEDS_REVIEW


def test_audit_events_racontent_les_transformations() -> None:
    """Audit : JOURNEY_RECALCULATED puis DOCUMENT_ADDED / ANALYZED / STATUS_CHANGED."""
    jid = _jid()
    _post_journey(jid, [{"requirementId": "medical", "status": "PROVIDED"}])
    client.post(
        "/api/documents/analyze",
        data={"requirementId": "medical", "journeyId": jid},
        files={"file": ("scan.txt", b"texte", "text/plain")},
    )

    from agent.infrastructure.db.engine import db_session

    with db_session() as s:
        events = {e.event_type for e in s.execute(
            select(AuditEvent).where(AuditEvent.journey_id == jid)
        ).scalars().all()}
    assert "JOURNEY_RECALCULATED" in events
    assert "DOCUMENT_ADDED" in events
    assert "DOCUMENT_ANALYZED" in events
    assert "REQUIREMENT_STATUS_CHANGED" in events


def test_tool_calls_are_persisted() -> None:
    """Chaque appel d'outil est tracé en base (nom, args, résultat, statut, latence) — §7.3."""
    execute_tool("get_next_action", {"journey_id": "driving_license_new"})
    from agent.infrastructure.db.engine import db_session

    with db_session() as s:
        rows = s.execute(select(ToolCall).where(ToolCall.tool_name == "get_next_action")).scalars().all()
    assert rows
    last = rows[-1]
    assert last.status == "success"
    assert last.latency_ms >= 0
    assert last.arguments == {"journey_id": "driving_license_new"}