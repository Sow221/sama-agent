"""Modèles SQLAlchemy 2.0 — schéma de la référence §7.3 (16 tables).

Points de contrat important :
  · journeys + journey_requirements = l'état du dossier (source de vérité),
  · document_observations garde le statut ANALYZED (jamais VALIDATED_BY_AI),
  · agent_messages ≠ état du parcours (on ne reconstruit jamais depuis l'historique),
  · tool_calls trace chaque appel d'outil (nom, arguments, résultat, statut, latence).
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class User(TimestampMixin, Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    preferred_language: Mapped[str] = mapped_column(String(8), default="fr")  # wo | fr
    status: Mapped[str] = mapped_column(String(24), default="active")


class Session(TimestampMixin, Base):
    __tablename__ = "sessions"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    channel: Mapped[str] = mapped_column(String(12), default="WEB")  # VOICE | TEXT | WEB
    status: Mapped[str] = mapped_column(String(24), default="open")


class AgentMessage(Base):
    __tablename__ = "agent_messages"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.id"))
    role: Mapped[str] = mapped_column(String(12))  # USER | ASSISTANT | SYSTEM | TOOL
    content: Mapped[str] = mapped_column(Text)
    language: Mapped[str | None] = mapped_column(String(8), nullable=True)
    audio_storage_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Procedure(TimestampMixin, Base):
    __tablename__ = "procedures"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    jurisdiction: Mapped[str | None] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(String(24), default="active")


class ProcedureVersion(TimestampMixin, Base):
    __tablename__ = "procedure_versions"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    procedure_id: Mapped[str] = mapped_column(ForeignKey("procedures.id"))
    version: Mapped[str] = mapped_column(String(16), default="1")
    effective_from: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    effective_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(24), default="active")


class ProcedureStep(Base):
    __tablename__ = "procedure_steps"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    procedure_version_id: Mapped[str] = mapped_column(ForeignKey("procedure_versions.id"))
    step_order: Mapped[int] = mapped_column(Integer)
    code: Mapped[str] = mapped_column(String(64))
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)


class Requirement(Base):
    __tablename__ = "requirements"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    procedure_version_id: Mapped[str] = mapped_column(ForeignKey("procedure_versions.id"))
    code: Mapped[str] = mapped_column(String(64))
    label: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    required: Mapped[bool] = mapped_column(Boolean, default=True)


class Source(Base):
    __tablename__ = "sources"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    title: Mapped[str] = mapped_column(String(255))
    publisher: Mapped[str | None] = mapped_column(String(255), nullable=True)
    url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    retrieved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(24), default="active")


class RequirementSource(Base):
    __tablename__ = "requirement_sources"
    requirement_id: Mapped[str] = mapped_column(ForeignKey("requirements.id"), primary_key=True)
    source_id: Mapped[str] = mapped_column(ForeignKey("sources.id"), primary_key=True)
    claim: Mapped[str] = mapped_column(Text)


class Journey(TimestampMixin, Base):
    __tablename__ = "journeys"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    session_id: Mapped[str | None] = mapped_column(ForeignKey("sessions.id"), nullable=True)
    procedure_version_id: Mapped[str] = mapped_column(ForeignKey("procedure_versions.id"))
    status: Mapped[str] = mapped_column(String(32))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class JourneyRequirement(Base):
    __tablename__ = "journey_requirements"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    journey_id: Mapped[str] = mapped_column(ForeignKey("journeys.id"))
    requirement_id: Mapped[str] = mapped_column(ForeignKey("requirements.id"))
    # MISSING | PROVIDED | ANALYZED | NEEDS_REVIEW | UNKNOWN — l'état de CET utilisateur
    status: Mapped[str] = mapped_column(String(24))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class Document(TimestampMixin, Base):
    __tablename__ = "documents"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    journey_id: Mapped[str] = mapped_column(ForeignKey("journeys.id"))
    requirement_id: Mapped[str] = mapped_column(ForeignKey("requirements.id"))
    filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    mime_type: Mapped[str | None] = mapped_column(String(128), nullable=True)
    storage_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    status: Mapped[str] = mapped_column(String(24))


class DocumentObservation(Base):
    __tablename__ = "document_observations"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id"))
    detected_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    readability: Mapped[bool] = mapped_column(Boolean, default=False)
    observations: Mapped[list] = mapped_column(JSON, default=list)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    model: Mapped[str] = mapped_column(String(64), default="deterministic")
    model_version: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Evidence(Base):
    __tablename__ = "evidence"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    journey_id: Mapped[str | None] = mapped_column(ForeignKey("journeys.id"), nullable=True)
    requirement_id: Mapped[str | None] = mapped_column(ForeignKey("requirements.id"), nullable=True)
    source_id: Mapped[str | None] = mapped_column(ForeignKey("sources.id"), nullable=True)
    claim: Mapped[str] = mapped_column(Text)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    limitation: Mapped[str | None] = mapped_column(Text, nullable=True)
    retrieved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ToolCall(Base):
    __tablename__ = "tool_calls"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    session_id: Mapped[str | None] = mapped_column(ForeignKey("sessions.id"), nullable=True)
    message_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    tool_name: Mapped[str] = mapped_column(String(64))
    arguments: Mapped[dict] = mapped_column(JSON)
    result: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(String(16))  # success | failed
    latency_ms: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AuditEvent(Base):
    __tablename__ = "audit_events"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    session_id: Mapped[str | None] = mapped_column(ForeignKey("sessions.id"), nullable=True)
    journey_id: Mapped[str | None] = mapped_column(ForeignKey("journeys.id"), nullable=True)
    event_type: Mapped[str] = mapped_column(String(40))
    payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Conversation(TimestampMixin, Base):
    """Historique des conversations (P1 — remplace le localStorage du front).

    `user_id` est l'identité réelle (sub Supabase) : chaque requête filtre par
    propriétaire — un usager ne peut JAMAIS lire/modifier/supprimer celle d'un autre
    (testé explicitement, cf. tests/matrix/test_conversations.py).
    """
    __tablename__ = "conversations"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), index=True)
    title: Mapped[str] = mapped_column(String(255), default="Nouvelle conversation")
    status: Mapped[str] = mapped_column(String(24), default="active")  # active | archived
    journey_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    last_activity_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class ConversationMessage(Base):
    __tablename__ = "conversation_messages"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    conversation_id: Mapped[str] = mapped_column(ForeignKey("conversations.id"), index=True)
    role: Mapped[str] = mapped_column(String(12))  # user | assistant
    content: Mapped[str] = mapped_column(Text)
    language: Mapped[str | None] = mapped_column(String(8), nullable=True)
    journey_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class MemoryItem(TimestampMixin, Base):
    """Mémoire long terme (P1) — liée à l'usager, persistante, récupérable, supprimable.

    kinds : SELF (identité/parcours) · PREFERENCE (préférences) · FACT (fait mémorisé) ·
            TEMPORARY (info courte durée) · CONVERSATION (résumé lié à un échange).
    """
    __tablename__ = "memory_items"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), index=True)
    kind: Mapped[str] = mapped_column(String(24))
    content: Mapped[str] = mapped_column(Text)
    source: Mapped[str | None] = mapped_column(String(24), nullable=True)  # voice | text | agent
    journey_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class DataItem(TimestampMixin, Base):
    """Usine à données (doc 11) : un exemple wolof candidat et ses contrôles automatiques.

    kind : AUDIO_TEXT (audio + texte, pour l'oreille) · FR_WO (paire traduite).
    checks : scores des contrôles K1–K5 (ex. {"K1": {"wer": 0.08, "passed": true, …}}).
    auto_pass : verdict agrégé des contrôles automatiques (None = non contrôlé).
    status : pending → accepted | rejected (verdict humain de l'étalon).
    """
    __tablename__ = "df_items"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    kind: Mapped[str] = mapped_column(String(16), index=True)
    text_wo: Mapped[str] = mapped_column(Text)
    text_fr: Mapped[str | None] = mapped_column(Text, nullable=True)
    audio_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    source: Mapped[str] = mapped_column(String(128))
    checks: Mapped[dict] = mapped_column(JSON, default=dict)
    auto_pass: Mapped[bool | None] = mapped_column(Boolean, nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(16), default="pending", index=True)


class DataVerdict(Base):
    """Verdict de l'étalon wolophone sur un DataItem : ok · ko · edit (avec correction)."""
    __tablename__ = "df_verdicts"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    item_id: Mapped[str] = mapped_column(ForeignKey("df_items.id"), index=True)
    user_id: Mapped[str] = mapped_column(String(64), index=True)
    verdict: Mapped[str] = mapped_column(String(8))
    correction: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


# Toutes les tables pour alembic / create_all
ALL_MODELS = (
    User, Session, AgentMessage, Procedure, ProcedureVersion, ProcedureStep,
    Requirement, Source, RequirementSource, Journey, JourneyRequirement,
    Document, DocumentObservation, Evidence, ToolCall, AuditEvent,
    Conversation, ConversationMessage, MemoryItem, DataItem, DataVerdict,
)