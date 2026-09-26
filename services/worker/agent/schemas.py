"""
Contrats Pydantic du worker — miroir des schémas Zod front (panning/spec-types-ts-zod.md, ADR-007).
Les enums viennent du module généré `enums` (packages/shared/gen, ADR-006 + D3 + parité).
Convention : camelCase — même contrat côté TS.
"""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, model_validator

from agent import bootstrap  # noqa: F401  (prépare le sys.path)
import enums


# ── Entrées ────────────────────────────────────────────────
class Context(BaseModel):
    model_config = ConfigDict(extra="forbid")

    journeyId: str | None = None
    stepId: str | None = None


class IntentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    transcript: str = Field(min_length=1)
    language: enums.Language | None = None
    context: Context | None = None


class JourneyDocument(BaseModel):
    """Document de dossier — entrée (client) et sortie (moteur). Strict des deux côtés."""

    model_config = ConfigDict(extra="forbid")

    requirementId: str
    name: str | None = None
    status: enums.DocumentStatus


class JourneyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    """Contrat strict (point 14) : la completion est TOUJOURS dérivée — tout champ
    inconnu (dont completion) est rejeté avant d'atteindre le moteur."""

    journeyId: str
    procedureId: str | None = None
    documents: list[JourneyDocument] | None = None


# ── Sorties ────────────────────────────────────────────────
class IntentResponse(BaseModel):
    intent: enums.Intent
    action: enums.IntentAction
    language: enums.Language
    confidence: float = Field(ge=0.0, le=1.0)
    needsClarification: bool
    clarificationQuestion: str | None = None
    transcript: str | None = None


class DocumentAnalysis(BaseModel):
    requirementId: str
    status: enums.DocumentStatus
    matchedType: enums.DocumentType | None = None
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    reason: str | None = None
    fileName: str | None = None
    # G11 : observations factuelles de la vision (pas une certification), + recommandation.
    observations: list[str] = Field(default_factory=list)
    requiresHumanReview: bool = True


class JourneyStep(BaseModel):
    id: str
    name: str
    order: int
    status: str  # "done" | "active" | "todo"


class Completion(BaseModel):
    provided: int = Field(ge=0)
    required: int = Field(ge=1)
    # G3 : ratio TOUJOURS dérivé — valeur par défaut acceptée mais écrasée par le validator.
    ratio: float = Field(default=0.0, ge=0.0, le=1.0)

    @model_validator(mode="after")
    def _ratio_is_derived(self) -> "Completion":
        """G3 : le ratio est TOUJOURS dérivé, jamais accepté en entrée."""
        self.ratio = min(1.0, self.provided / self.required)
        return self


class JourneyResponse(BaseModel):
    journeyId: str
    procedureId: str
    status: enums.JourneyStatus
    steps: list[JourneyStep]
    completion: Completion
    documents: list[JourneyDocument]
    nextAction: enums.NextAction | None = None
    nextActionRequirement: str | None = None
    # G (point 12) : label + raison déterminés par le moteur (source unique enums.json),
    # jamais reconstruits côté front. FR = langue de l'application (la voix reformule en wolof).
    nextActionLabel: str | None = None
    nextActionReason: str | None = None


class Evidence(BaseModel):
    requirement: str
    procedureId: str
    source: str
    sourceUrl: str | None = None
    description: str
    limitations: list[str]


class VoiceTokenRequest(BaseModel):
    """Demande de jeton vocal. Le dossier est optionnel : à défaut, l'API reprend
    le dossier de l'usager (le plus récent) — jamais un nom de room arbitraire."""
    journeyId: str | None = None
    ttl: int = 3600


class VoiceToken(BaseModel):
    url: str
    token: str
    # journeyId / room sont explicites : le worker vocal n'a plus à deviner le
    # dossier depuis le nom de la room (cause du KeyError "sama-demo").
    journeyId: str
    room: str
    identity: str
    ttl: int


class RequestTrace(BaseModel):
    """Tracé de chaque appel (C §55) — porté par les en-têtes + logs."""
    requestId: str
    timestamp: str
    path: str
    latencyMs: float | None = None
    intent: str | None = None
    model: str | None = None
    confidence: float | None = None
    journeyState: str | None = None
    documentStatus: str | None = None
    error: str | None = None
    fallbackUsed: bool = False


# ── Historique des conversations (P1) ───────────────────────────────────────
class ConversationCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str | None = Field(default=None, max_length=255)
    journeyId: str | None = None


class ConversationUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str | None = Field(default=None, max_length=255)
    status: str | None = None


class MessageCreate(BaseModel):
    """Ajout d'un message ENTRANT (user) — l'assistant est écrit par le serveur."""
    model_config = ConfigDict(extra="forbid")
    role: str = "user"
    content: str = Field(min_length=1, max_length=100_000)
    language: str | None = None
    journeyId: str | None = None


class AgentTurnRequest(BaseModel):
    """Tour d'agent conversationnel — histoire/mémoire/tools réels côté serveur."""
    model_config = ConfigDict(extra="forbid")
    text: str = Field(min_length=1)
    journeyId: str | None = None
    conversationId: str | None = None
    useTools: bool = False


class MemoryCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: str = "FACT"  # SELF | PREFERENCE | FACT | TEMPORARY | CONVERSATION
    content: str = Field(min_length=1, max_length=10_000)
    source: str | None = None
    journeyId: str | None = None