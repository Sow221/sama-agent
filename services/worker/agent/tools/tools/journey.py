"""Outils « parcours » — le MOTEUR déterministe répond (via le use case get_journey).

Règle §5.4 : le modèle orchestre, le système exécute. Ces fonctions ne contiennent
aucune décision : elles transposent des arguments JSON en contrat, puis retournent
l'état calculé (statuts, DocumentsStatus, NextAction — jamais formulés par le LLM).
"""
from __future__ import annotations

from agent import mode as app_mode
from agent.schemas import JourneyDocument, JourneyRequest
from agent.application.use_cases.get_journey import get_journey
import enums


def _documents_of(arguments: dict) -> list[JourneyDocument] | None:
    """Reconstruit les documents connus (contrat du tool) — sinon le moteur complète en MISSING."""
    raw = arguments.get("documents")
    if not raw:
        return None
    docs: list[JourneyDocument] = []
    for item in raw:
        status = item.get("status")
        if status not in {e.value for e in enums.DocumentStatus}:
            raise ValueError(f"statut de document invalide : {status!r}")
        docs.append(JourneyDocument(requirementId=item["requirement_id"], status=status))
    return docs


def _journey(arguments: dict):
    """État du dossier vu par l'outil.

    Live : le dossier persisté fait foi (resume_journey) — des statuts proposés
    par le MODÈLE ne peuvent jamais rendre un dossier plus prêt que la base.
    Harnais deterministic : les documents fournis amorcent les scénarios de test.
    """
    journey_id = arguments["journey_id"]
    if app_mode.is_live():
        from agent.application.use_cases.persist_journey import resume_journey

        return resume_journey(journey_id)
    return get_journey(JourneyRequest(journeyId=journey_id, documents=_documents_of(arguments)))


def get_journey_state(arguments: dict) -> dict:
    return _journey(arguments).model_dump()


def get_missing_requirements(arguments: dict) -> dict:
    journey = _journey(arguments)
    missing = [d.model_dump() for d in journey.documents if d.status == enums.DocumentStatus.MISSING]
    return {"journeyId": journey.journeyId, "count": len(missing), "missing": missing}


def get_next_action(arguments: dict) -> dict:
    journey = _journey(arguments)
    return {
        "journeyId": journey.journeyId,
        "status": journey.status,
        "nextAction": journey.nextAction,
        "nextActionLabel": journey.nextActionLabel,
        "nextActionReason": journey.nextActionReason,
        "nextActionRequirement": journey.nextActionRequirement,
    }