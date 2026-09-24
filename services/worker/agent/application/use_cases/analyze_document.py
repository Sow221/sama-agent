"""Use case : analyser un document fourni (vision réelle / NEEDS_REVIEW honnête).

Chaîne : fichier réel → VisionProvider (infra) → DocumentObservation → classification
domaine (document.classify) — ANALYZED ≠ VALIDATED, jamais de certification (G11).
En mode deterministic : aucun modèle → NEEDS_REVIEW honnête (C §54).
"""
from __future__ import annotations

from agent import mode as app_mode
from agent.schemas import DocumentAnalysis
from agent.domain.document import classify, OBS_UNSUPPORTED, OBS_UNAVAILABLE, OBS_INTERRUPTED, OBS_HUMAN
from agent.infrastructure.vision.glm import GlmVisionProvider
import enums


def analyze_document(
    requirement_id: str,
    file_name: str,
    file_bytes: bytes,
    content_type: str,
    vision: GlmVisionProvider | None = None,
) -> DocumentAnalysis:
    if not app_mode.is_live():
        # Honnête : aucun modèle disponible → jamais « conforme ».
        return DocumentAnalysis(
            requirementId=requirement_id,
            status=enums.DocumentStatus.NEEDS_REVIEW,
            fileName=file_name,
            reason="Analyse indisponible (mode déterministe) : à vérifier par le service.",
            observations=[OBS_UNAVAILABLE, OBS_HUMAN],
            requiresHumanReview=True,
        )

    if not content_type.startswith("image/"):
        return DocumentAnalysis(
            requirementId=requirement_id,
            status=enums.DocumentStatus.NEEDS_REVIEW,
            fileName=file_name,
            reason="Format non pris en charge pour l'analyse automatique.",
            observations=[OBS_UNSUPPORTED, OBS_HUMAN],
            requiresHumanReview=True,
        )

    provider = vision or GlmVisionProvider()
    try:
        observation = provider.analyze(file_bytes, content_type)
    except Exception as exc:  # réseau / modèle indisponible : on ne fabrique jamais un succès
        return DocumentAnalysis(
            requirementId=requirement_id,
            status=enums.DocumentStatus.UNKNOWN,
            fileName=file_name,
            reason=f"Analyse impossible : {exc}",
            observations=[OBS_INTERRUPTED],
            requiresHumanReview=True,
        )
    return classify(requirement_id, file_name, observation)