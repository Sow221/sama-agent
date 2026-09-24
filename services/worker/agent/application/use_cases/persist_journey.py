"""Use case : persister l'état d'un parcours (POST /api/journey) et le REPRENDRE (GET resume).

La source de vérité est PostgreSQL (journeys + journey_requirements) ; le moteur
re-dérive statut/progression/NextAction à chaque lecture — jamais lu depuis le client.
"""
from __future__ import annotations

from agent.infrastructure.db.repositories import (
    JOURNEY_RECALCULATED,
    load_journey_state,
    record_audit,
    upsert_journey_state,
)
from agent.schemas import JourneyRequest, JourneyResponse
from agent.application.use_cases.get_journey import get_journey


def apply_journey(req: JourneyRequest) -> JourneyResponse:
    """Dérive l'état réel, le persiste (journey + journey_requirements) et l'audite."""
    journey = get_journey(req)  # KeyError = procédure inconnue (→ 404 métier)
    upsert_journey_state(journey)
    record_audit(JOURNEY_RECALCULATED, journey_id=req.journeyId,
                 payload={"status": journey.status, "nextAction": journey.nextAction})
    return journey


def resume_journey(journey_id: str) -> JourneyResponse:
    """Reprise : relit l'état persisté puis re-dérive avec le moteur (jamais l'historique)."""
    state = load_journey_state(journey_id)
    if state is None:
        raise KeyError(f"parcours inconnu : {journey_id}")
    journey = get_journey(
        JourneyRequest(journeyId=journey_id, procedureId=state["procedureId"], documents=state["documents"])
    )
    record_audit(JOURNEY_RECALCULATED, journey_id=journey_id, payload={"source": "resume"})
    return journey