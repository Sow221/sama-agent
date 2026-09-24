"""Seed idempotent — connaissance administrative depuis data/procedures + data/evidence
(source de vérité du référentiel CI, ADV-006). Rejouable sans effet de bord :
chaque ligne est upsertée par clé primaire naturelle.

Reste hors de ce module : le seed de **données utilisateur** (journeys…) qui naît
de l'usage réel des endpoints — jamais simulé.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

from sqlalchemy import select

from agent.bootstrap import DATA_DIR
from agent.infrastructure.db.models import (
    Procedure,
    ProcedureStep,
    ProcedureVersion,
    Requirement,
    RequirementSource,
    Source,
)

PROCEDURES_DIR = DATA_DIR / "procedures"
EVIDENCE_DIR = DATA_DIR / "evidence"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _get_or_create(session, model, pk_id: str) -> tuple:
    row = session.get(model, pk_id)
    return row, row is None


def _procedure_version_id(procedure_id: str, version: str = "1") -> str:
    return f"{procedure_id}@{version}"


def _seed_procedure(session, data: dict) -> None:
    pid = data["id"]
    if (row := session.get(Procedure, pid)) is None:
        session.add(Procedure(id=pid, name=data.get("name", pid), jurisdiction=data.get("jurisdiction"),
                              status="active"))
    version_id = _procedure_version_id(pid)
    if session.get(ProcedureVersion, version_id) is None:
        session.add(ProcedureVersion(id=version_id, procedure_id=pid, version="1",
                                     effective_from=_utcnow(), status="active"))
    for i, step in enumerate(data.get("steps", [])):
        sid = f"{pid}:v1:s{step['order']}"
        if session.get(ProcedureStep, sid) is None:
            session.add(ProcedureStep(id=sid, procedure_version_id=version_id,
                                      step_order=int(step["order"]), code=step["id"], title=step["name"]))
    for req in data.get("requirements", []):
        rid = req["id"]
        if session.get(Requirement, rid) is None:
            session.add(Requirement(id=rid, procedure_version_id=version_id, code=req["id"],
                                    label=req.get("name", req["id"]), required=bool(req.get("required", True))))


def _seed_evidence_sources(session) -> None:
    """Relie chaque exigence à SA source enregistrée (C §66 : « d'où vient cette exigence ? »)."""
    seen: set[str] = set()  # le get() ne voit pas les ajouts en attente (autoflush off)

    def _add_source(source_id: str, **kwargs) -> None:
        if source_id in seen or session.get(Source, source_id) is not None:
            return
        session.add(Source(id=source_id, **kwargs))
        seen.add(source_id)

    for path in EVIDENCE_DIR.glob("*.json"):
        data = json.loads(path.read_text("utf-8"))
        requirement = data.get("requirement")
        if not requirement:
            continue
        source_id = f"src-{requirement}"
        _add_source(source_id, title=data.get("source", "Source enregistrée"),
                    url=data.get("sourceUrl"), retrieved_at=_utcnow(), status="active")
        if session.get(RequirementSource, (requirement, source_id)) is None:
            session.add(RequirementSource(requirement_id=requirement, source_id=source_id,
                                          claim=data.get("description", "")))
        # La source officielle citée par les procédures (ex. capp_karangue).
        _add_source("capp_karangue", title=data.get("source", "CAPP Karangë"),
                    url=data.get("sourceUrl"), status="active")


def seed_from_data(session) -> None:
    for path in sorted(PROCEDURES_DIR.glob("*.json")):
        _seed_procedure(session, json.loads(path.read_text("utf-8")))
    _seed_evidence_sources(session)