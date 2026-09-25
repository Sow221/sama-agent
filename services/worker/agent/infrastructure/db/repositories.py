"""Repositories — accès concrets à la base (PostgreSQL cible, SQLite dev/tests).

Le domaine reste pur (aucun import d'ici) ; ces fonctions sont appelées par la couche
application (use cases de persistance) et par le runtime (trace tool_calls).
Chaque appel ouvre sa propre transaction via db_session() (commit automatique).
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone

from sqlalchemy import select

from agent import mode as app_mode
from agent.infrastructure.db.engine import db_session
from agent.infrastructure.db.models import (
    AuditEvent,
    Document,
    DocumentObservation,
    Journey,
    JourneyRequirement,
    ProcedureVersion,
    ToolCall,
    User,
)
from agent.schemas import DocumentAnalysis, JourneyDocument, JourneyResponse
import enums

# Événements racontés par l'audit (reference §7.3) — le parcours est une suite
# de transformations, jamais reconstruit depuis l'historique conversationnel.
DOCUMENT_ADDED = "DOCUMENT_ADDED"
DOCUMENT_ANALYZED = "DOCUMENT_ANALYZED"
REQUIREMENT_STATUS_CHANGED = "REQUIREMENT_STATUS_CHANGED"
JOURNEY_RECALCULATED = "JOURNEY_RECALCULATED"
NEXT_ACTION_CHANGED = "NEXT_ACTION_CHANGED"


def _new_id() -> str:
    return uuid.uuid4().hex


def _version_id_of(procedure_code: str) -> str:
    return f"{procedure_code}@1"


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ── Utilisateurs (Supabase Auth — identité réelle, jamais simulée) ─────────
def upsert_user(user_id: str) -> None:
    """Ancre l'usager authentifié en base (users.id ← sub du JWT). Idempotent."""
    with db_session() as session:
        if session.get(User, user_id) is None:
            session.add(User(id=user_id, status="active"))


# ── Journeys (source de vérité du dossier) ─────────────────────────────────
def upsert_journey_state(journey: JourneyResponse, user_id: str | None = None) -> None:
    """Persiste le parcours dérivé : journées + état par exigence (journey_requirements).

    user_id (live) : approprie le dossier à l'usager — un parcours créé par un
    autre utilisateur est refusé (PermissionError → 403). En mode déterministe
    (harnais) user_id = identité de service, aucune restriction.
    """
    with db_session() as session:
        previous = session.get(Journey, journey.journeyId)
        if previous is None:
            session.add(Journey(
                id=journey.journeyId,
                user_id=user_id,
                procedure_version_id=_version_id_of(journey.procedureId),
                status=journey.status,
                completed_at=_now() if journey.status == enums.JourneyStatus.READY_FOR_NEXT_STEP else None,
            ))
        else:
            if user_id and previous.user_id not in (None, user_id):
                raise PermissionError(f"parcours {journey.journeyId} d'un autre usager")
            if user_id and previous.user_id is None:
                previous.user_id = user_id
            previous.status = journey.status
            previous.completed_at = _now() if journey.status == enums.JourneyStatus.READY_FOR_NEXT_STEP else None
            previous.updated_at = _now()
            if previous.status != journey.status:
                _audit(session, NEXT_ACTION_CHANGED, journey_id=journey.journeyId,
                       payload={"from": previous.status.value if hasattr(previous.status, "value") else str(previous.status),
                                "to": journey.status.value if hasattr(journey.status, "value") else str(journey.status),
                                "nextAction": journey.nextAction})
        for doc in journey.documents:
            existing = session.execute(
                select(JourneyRequirement).where(
                    JourneyRequirement.journey_id == journey.journeyId,
                    JourneyRequirement.requirement_id == doc.requirementId,
                )
            ).scalar_one_or_none()
            status = doc.status.value if hasattr(doc.status, "value") else str(doc.status)
            if existing is None:
                session.add(JourneyRequirement(
                    id=_new_id(), journey_id=journey.journeyId,
                    requirement_id=doc.requirementId, status=status,
                ))
            else:
                existing.status = status
                existing.updated_at = _now()


def load_journey_state(journey_id: str, user_id: str | None = None) -> dict | None:
    """État persisté du dossier : procedureId + documents connus (ou None si inconnu).

    user_id (live) : approprie la lecture — un dossier d'un autre usager est
    invisible (None → 404), exactement comme un dossier inconnu.
    """
    with db_session() as session:
        row = session.get(Journey, journey_id)
        if row is None:
            return None
        if user_id and row.user_id and row.user_id != user_id:
            return None
        version = session.get(ProcedureVersion, row.procedure_version_id)
        reqs = session.execute(
            select(JourneyRequirement).where(JourneyRequirement.journey_id == journey_id)
        ).scalars().all()
        docs = [
            JourneyDocument(requirementId=r.requirement_id, status=enums.DocumentStatus(r.status))
            for r in reqs
        ]
        return {"procedureId": version.procedure_id if version else None, "documents": docs}


# ── Documents + observations ───────────────────────────────────────────────
def record_document(journey_id: str, analysis: DocumentAnalysis, file_name: str, mime_type: str) -> None:
    """Persiste un document analysé + ses observations (ANALYZED ≠ VALIDATED) + audit."""
    with db_session() as session:
        doc_id = _new_id()
        session.add(Document(
            id=doc_id,
            journey_id=journey_id,
            requirement_id=analysis.requirementId,
            filename=file_name,
            mime_type=mime_type,
            storage_key=None,
            status=analysis.status.value if hasattr(analysis.status, "value") else str(analysis.status),
        ))
        session.add(DocumentObservation(
            id=_new_id(),
            document_id=doc_id,
            detected_type=analysis.matchedType.value if analysis.matchedType else None,
            readability=analysis.status == enums.DocumentStatus.ANALYZED,
            observations=list(analysis.observations or []),
            confidence=analysis.confidence,
            model=f"live:{os.getenv('NVIDIA_MODEL', 'z-ai/glm-5.3')}" if app_mode.is_live() else "deterministic",
        ))
        # L'état du dossier suit l'observation (source de vérité journeys côté lecture).
        existing = session.execute(
            select(JourneyRequirement).where(
                JourneyRequirement.journey_id == journey_id,
                JourneyRequirement.requirement_id == analysis.requirementId,
            )
        ).scalar_one_or_none()
        status = analysis.status.value if hasattr(analysis.status, "value") else str(analysis.status)
        if existing is None:
            session.add(JourneyRequirement(id=_new_id(), journey_id=journey_id,
                                           requirement_id=analysis.requirementId, status=status))
        else:
            existing.status = status
            existing.updated_at = _now()
        _audit(session, DOCUMENT_ADDED, journey_id=journey_id,
               payload={"requirementId": analysis.requirementId, "fileName": file_name})
        _audit(session, DOCUMENT_ANALYZED, journey_id=journey_id,
               payload={"requirementId": analysis.requirementId, "status": status})
        _audit(session, REQUIREMENT_STATUS_CHANGED, journey_id=journey_id,
               payload={"requirementId": analysis.requirementId, "status": status})


# ── Audit ──────────────────────────────────────────────────────────────────
def _audit(session, event_type: str, journey_id: str | None = None,
           session_id: str | None = None, payload: dict | None = None) -> None:
    session.add(AuditEvent(id=_new_id(), session_id=session_id, journey_id=journey_id,
                           event_type=event_type, payload=payload))


def record_audit(event_type: str, journey_id: str | None = None,
                 session_id: str | None = None, payload: dict | None = None) -> None:
    with db_session() as session:
        _audit(session, event_type, journey_id=journey_id, session_id=session_id, payload=payload)


# ── Tool calls (chaque appel d'outil est tracé, §7.3) ─────────────────────
def save_tool_call(tool_name: str, arguments: dict, result: dict | None,
                   status: str, latency_ms: float, session_id: str | None = None) -> None:
    with db_session() as session:
        session.add(ToolCall(id=_new_id(), session_id=session_id, tool_name=tool_name,
                             arguments=arguments, result=result, status=status,
                             latency_ms=latency_ms))