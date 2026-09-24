"""
Contrats Pydantic du worker — miroir des schémas Zod front (panning/spec-types-ts-zod.md, ADR-007).
Les enums viennent du module généré `enums` (packages/shared/gen, ADR-006 + D3 + parité).
Convention : camelCase — même contrat côté TS.
"""
from __future__ import annotations

from pydantic import BaseModel, Field, model_validator

from agent import bootstrap  # noqa: F401  (prépare le sys.path)
import enums


# ── Entrées ────────────────────────────────────────────────
class Context(BaseModel):
    journeyId: str | None = None
    stepId: str | None = None


class IntentRequest(BaseModel):
    transcript: str = Field(min_length=1)
    language: enums.Language | None = None
    context: Context | None = None


class JourneyDocument(BaseModel):
    requirementId: str
    name: str | None = None
    status: enums.DocumentStatus


class JourneyRequest(BaseModel):
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


class JourneyStep(BaseModel):
    id: str
    name: str
    order: int
    status: str  # "done" | "active" | "todo"


class Completion(BaseModel):
    provided: int = Field(ge=0)
    required: int = Field(ge=1)
    ratio: float = Field(ge=0.0, le=1.0)

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


class Evidence(BaseModel):
    requirement: str
    procedureId: str
    source: str
    sourceUrl: str | None = None
    description: str
    limitations: list[str]


class VoiceToken(BaseModel):
    url: str
    token: str


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