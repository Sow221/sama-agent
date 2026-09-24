"""Domaine Document — classification des observations de la vision.

Séparation IA / déterministe :
  - infrastructure (VisionProvider, GLM multimodal) OBSERVE l'image ;
  - le domaine CLASSE l'observation en statuts DocumentStatus + observations factuelles.
JAMAIS de certification ; le statut « validé par l'IA » n'existe nulle part
(G11 : ANALYZED ≠ VALIDATED — le contrat le rejette en 422, test C).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from agent.schemas import DocumentAnalysis
import enums

MATCH_RULES: dict[str, enums.DocumentType] = {
    "carte": enums.DocumentType.identity_document,
    "identité": enums.DocumentType.identity_document,
    "id card": enums.DocumentType.identity_document,
    "medical": enums.DocumentType.medical_certificate,
    "certificat": enums.DocumentType.medical_certificate,
    "photo": enums.DocumentType.photo,
}
BLUR_SIGNALS = ("flou", "illisible", "blurry", "unreadable")

# Observations factuelles (G11) — dérivées du résultat réel de la vision.
OBS_TEXT = "texte détecté"
OBS_READABLE = "document lisible détecté"
OBS_IDENTITY = "informations d'identité visibles"
OBS_UNSUPPORTED = "format non analysable automatiquement"
OBS_UNAVAILABLE = "analyse automatique indisponible dans cet environnement"
OBS_INTERRUPTED = "analyse interrompue (service de vision indisponible)"
OBS_HUMAN = "à vérifier par le service"


@dataclass(frozen=True)
class DocumentObservation:
    """Observation brute de la vision — factuelle, jamais une validation."""
    content_type: str
    readable: bool
    matches_expected: bool
    confidence: float
    reason: str


class VisionProvider(Protocol):
    """Frontière Ia/infra : produire une observation à partir du fichier fourni."""

    def analyze(self, file_bytes: bytes, content_type: str) -> DocumentObservation:
        ...


def classify(requirement_id: str, file_name: str, obs: DocumentObservation) -> DocumentAnalysis:
    """Classe une observation réelle → DocumentAnalysis (règles pures, testable)."""
    if not obs.readable or any(s in obs.reason.lower() for s in BLUR_SIGNALS):
        return DocumentAnalysis(
            requirementId=requirement_id,
            status=enums.DocumentStatus.NEEDS_REVIEW,
            fileName=file_name,
            reason=obs.reason or "Document flou ou illisible — à vérifier.",
            observations=["document flou ou illisible", "texte non fiable détecté"],
            requiresHumanReview=True,
        )
    matched = MATCH_RULES.get(obs.content_type)
    if obs.matches_expected and matched is not None:
        obs_list = [OBS_TEXT, OBS_READABLE, f"type détecté : {obs.content_type}"] + (
            [OBS_IDENTITY] if matched == enums.DocumentType.identity_document else []
        )
        return DocumentAnalysis(
            requirementId=requirement_id,
            status=enums.DocumentStatus.ANALYZED,
            matchedType=matched,
            confidence=obs.confidence,
            fileName=file_name,
            reason=obs.reason,
            observations=obs_list,
            # ANALYZED ≠ certifié : une vérification humaine reste possible si faible confiance.
            requiresHumanReview=obs.confidence < 0.8,
        )
    return DocumentAnalysis(
        requirementId=requirement_id,
        status=enums.DocumentStatus.UNEXPECTED,
        fileName=file_name,
        reason="Le document ne correspond pas à l'élément attendu.",
        observations=[f"contenu détecté : {obs.content_type}", "ne correspond pas à l'élément attendu"],
        requiresHumanReview=True,
    )