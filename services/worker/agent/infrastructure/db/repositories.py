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
    Conversation,
    ConversationMessage,
    Document,
    DocumentObservation,
    Journey,
    JourneyRequirement,
    MemoryItem,
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
            # L'ancien statut doit être capturé AVANT l'affectation, sinon la
            # comparaison est toujours fausse et NEXT_ACTION_CHANGED ne part jamais.
            from_status = (previous.status.value if hasattr(previous.status, "value")
                           else str(previous.status))
            to_status = journey.status.value if hasattr(journey.status, "value") else str(journey.status)
            previous.status = journey.status
            previous.completed_at = _now() if journey.status == enums.JourneyStatus.READY_FOR_NEXT_STEP else None
            previous.updated_at = _now()
            if from_status != to_status:
                _audit(session, NEXT_ACTION_CHANGED, journey_id=journey.journeyId,
                       payload={"from": from_status, "to": to_status,
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


def latest_journey_of(user_id: str) -> str | None:
    """Dossier de travail de l'usager : le plus récemment modifié.

    Utilisé par `POST /api/voice/token` quand la requête ne précise pas de
    dossier — le worker vocal a besoin d'un dossier réel, pas d'un nom de room
    arbitraire. Un dossier sans propriétaire (harnais déterministe) n'est pas
    attribuable : on l'ignore plutôt que de le voler.
    """
    if not user_id:
        return None
    with db_session() as session:
        return session.execute(
            select(Journey.id)
            .where(Journey.user_id == user_id)
            .order_by(Journey.updated_at.desc())
            .limit(1)
        ).scalar_one_or_none()


def journey_belongs_to_user(journey_id: str, user_id: str) -> bool:
    """Vérifie strictement le propriétaire d'un parcours, y compris les lignes orphelines."""
    if not journey_id or not user_id:
        return False
    with db_session() as session:
        row = session.get(Journey, journey_id)
        return row is not None and row.user_id == user_id


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


# ── Conversations (P1 — historique réel, isolation par propriétaire) ────────
def create_conversation(user_id: str, title: str | None = None,
                        journey_id: str | None = None) -> dict:
    """Crée une conversation du propriétaire `user_id` (identité réelle, sub JWT)."""
    row_id = _new_id()
    with db_session() as session:
        session.add(Conversation(
            id=row_id, user_id=user_id,
            title=(title or "Nouvelle conversation").strip()[:255],
            journey_id=journey_id,
        ))
    return get_conversation(row_id, user_id)


def _conversation_dict(c) -> dict:
    return {
        "id": c.id, "title": c.title, "status": c.status,
        "journeyId": c.journey_id, "userId": c.user_id,
        "createdAt": c.created_at.isoformat() if c.created_at else None,
        "lastActivityAt": c.last_activity_at.isoformat() if c.last_activity_at else None,
    }


def get_conversation(conversation_id: str, user_id: str) -> dict | None:
    """Lecture STRICTEMENT du propriétaire : un dossier étranger = None (→ 404)."""
    with db_session() as session:
        c = session.get(Conversation, conversation_id)
        if c is None or c.user_id != user_id:
            return None
        return _conversation_dict(c)


def list_conversations(user_id: str, limit: int = 20, offset: int = 0) -> list[dict]:
    with db_session() as session:
        rows = session.execute(
            select(Conversation)
            .where(Conversation.user_id == user_id)
            .order_by(Conversation.last_activity_at.desc())
            .offset(offset).limit(limit)
        ).scalars().all()
        return [_conversation_dict(c) for c in rows]


def delete_conversation(conversation_id: str, user_id: str) -> bool:
    """Suppression propriétaire : cascade des messages. Étranger → False (→ 404)."""
    with db_session() as session:
        c = session.get(Conversation, conversation_id)
        if c is None or c.user_id != user_id:
            return False
        session.execute(
            ConversationMessage.__table__.delete().where(
                ConversationMessage.conversation_id == conversation_id)
        )
        session.delete(c)
        return True


def update_conversation(conversation_id: str, user_id: str, title: str | None = None,
                        status: str | None = None) -> dict | None:
    with db_session() as session:
        c = session.get(Conversation, conversation_id)
        if c is None or c.user_id != user_id:
            return None
        if title is not None:
            c.title = title.strip()[:255]
        if status is not None:
            c.status = status
    return get_conversation(conversation_id, user_id)


def add_conversation_message(conversation_id: str, user_id: str, role: str,
                             content: str, language: str | None = None,
                             journey_id: str | None = None) -> dict | None:
    """Ajoute un message (user|assistant) à la conversation du propriétaire.

    Touche `last_activity_at` — l'historique est trié par activité réelle.
    """
    mid = _new_id()
    with db_session() as session:
        c = session.get(Conversation, conversation_id)
        if c is None or c.user_id != user_id:
            return None
        session.add(ConversationMessage(
            id=mid, conversation_id=conversation_id, role=role,
            content=content[:100_000], language=language, journey_id=journey_id,
        ))
        c.last_activity_at = _now()
        if journey_id:
            c.journey_id = journey_id
    with db_session() as session:
        m = session.get(ConversationMessage, mid)
        return {
            "id": m.id, "conversationId": m.conversation_id, "role": m.role,
            "content": m.content, "language": m.language,
            "journeyId": m.journey_id,
            "createdAt": m.created_at.isoformat() if m.created_at else None,
        }


def list_conversation_messages(conversation_id: str, user_id: str,
                               limit: int = 100, offset: int = 0) -> list[dict] | None:
    """Messages paginés. Conversation étrangère → None (→ 404), jamais une fuite."""
    with db_session() as session:
        c = session.get(Conversation, conversation_id)
        if c is None or c.user_id != user_id:
            return None
        rows = session.execute(
            select(ConversationMessage)
            .where(ConversationMessage.conversation_id == conversation_id)
            .order_by(ConversationMessage.created_at.asc())
            .offset(offset).limit(limit)
        ).scalars().all()
        return [{
            "id": m.id, "conversationId": m.conversation_id, "role": m.role,
            "content": m.content, "language": m.language, "journeyId": m.journey_id,
            "createdAt": m.created_at.isoformat() if m.created_at else None,
        } for m in rows]


# ── Mémoire long terme (P1 — persistante, liée à l'usager, purgeable) ───────
_MEMORY_KINDS = {"SELF", "PREFERENCE", "FACT", "TEMPORARY", "CONVERSATION"}


def create_memory(user_id: str, kind: str, content: str, source: str | None = None,
                  journey_id: str | None = None) -> dict:
    kind = kind.upper()
    if kind not in _MEMORY_KINDS:
        raise ValueError(f"kind mémoire inconnu : {kind}")
    row_id = _new_id()
    with db_session() as session:
        session.add(MemoryItem(
            id=row_id, user_id=user_id, kind=kind,
            content=content.strip()[:10_000], source=source, journey_id=journey_id,
        ))
    return get_memory(row_id, user_id)


def _memory_dict(m) -> dict:
    return {
        "id": m.id, "kind": m.kind, "content": m.content, "source": m.source,
        "journeyId": m.journey_id,
        "createdAt": m.created_at.isoformat() if m.created_at else None,
        "updatedAt": m.updated_at.isoformat() if m.updated_at else None,
    }


def get_memory(memory_id: str, user_id: str) -> dict | None:
    with db_session() as session:
        m = session.get(MemoryItem, memory_id)
        if m is None or m.user_id != user_id:
            return None
        return _memory_dict(m)


def list_memory(user_id: str, kind: str | None = None,
                limit: int = 50, offset: int = 0) -> list[dict]:
    with db_session() as session:
        q = select(MemoryItem).where(MemoryItem.user_id == user_id)
        if kind:
            q = q.where(MemoryItem.kind == kind.upper())
        rows = session.execute(q.order_by(MemoryItem.updated_at.desc())
                               .offset(offset).limit(limit)).scalars().all()
        return [_memory_dict(m) for m in rows]


def search_memory(user_id: str, query: str, limit: int = 10) -> list[dict]:
    """Récupération par similarité de texte simple (LIKE insensible à la casse).

    Honnête et prévisible : la mémoire est récupérée par mots présents, pas par
    une « sémantique » invérifiable locale.
    """
    terms = [t for t in query.lower().split() if len(t) >= 3][:8]
    if not terms:
        return []
    with db_session() as session:
        from agent.infrastructure.db.models import MemoryItem as M
        clauses = [M.content.ilike(f"%{t}%") for t in terms]
        q = select(M).where(M.user_id == user_id, *clauses)
        rows = session.execute(q.order_by(M.updated_at.desc()).limit(limit)).scalars().all()
        return [_memory_dict(m) for m in rows]


def delete_memory(memory_id: str, user_id: str) -> bool:
    with db_session() as session:
        m = session.get(MemoryItem, memory_id)
        if m is None or m.user_id != user_id:
            return False
        session.delete(m)
        return True


def recall_top_memory(user_id: str, kinds: tuple[str, ...] = ("SELF", "PREFERENCE", "FACT"),
                      limit: int = 8) -> list[dict]:
    """Mémoire injectable dans le contexte LLM — propriétaire uniquement.

    Retourne les éléments les plus récents ; le prompt d'agent décide quoi utiliser.
    """
    if not user_id:
        return []
    with db_session() as session:
        rows = session.execute(
            select(MemoryItem)
            .where(MemoryItem.user_id == user_id, MemoryItem.kind.in_(kinds))
            .order_by(MemoryItem.updated_at.desc())
            .limit(limit)
        ).scalars().all()
        return [_memory_dict(m) for m in rows]