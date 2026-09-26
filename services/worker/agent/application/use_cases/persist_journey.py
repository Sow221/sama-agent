"""Use case : persister l'état d'un parcours (POST /api/journey) et le REPRENDRE (GET resume).

La source de vérité est PostgreSQL (journeys + journey_requirements) ; le moteur
re-dérive statut/progression/NextAction à chaque lecture — jamais lu depuis le client.
"""
from __future__ import annotations

from agent import mode as app_mode
from agent.infrastructure.db.repositories import (
    JOURNEY_RECALCULATED,
    load_journey_state,
    record_audit,
    upsert_journey_state,
)
from agent.schemas import JourneyRequest, JourneyResponse
from agent.application.use_cases.get_journey import get_journey


def _server_documents(req: JourneyRequest, user_id: str | None) -> JourneyRequest:
    """Live : l'état des documents vient de la BASE, jamais du client.

    Seule une analyse réelle (POST /api/documents/analyze) change le statut d'une
    exigence. Un client qui déclare « ANALYZED » sans fichier ne doit pas pouvoir
    rendre son dossier « prêt » : ses documents déclarés sont ignorés, l'état
    persisté (ou un dossier vierge) fait foi.
    """
    state = load_journey_state(req.journeyId, user_id=user_id)
    if state is None:
        return JourneyRequest(journeyId=req.journeyId, procedureId=req.procedureId)
    return JourneyRequest(
        journeyId=req.journeyId,
        procedureId=req.procedureId or state["procedureId"],
        documents=state["documents"],
    )


def apply_journey(req: JourneyRequest, user_id: str | None = None) -> JourneyResponse:
    """Dérive l'état réel, le persiste (journey + journey_requirements) et l'audite.

    En `deterministic` (harnais de test, identité de service), les documents
    déclarés servent à amorcer les scénarios, faute de vision réelle.
    """
    if app_mode.is_live():
        req = _server_documents(req, user_id)
    journey = get_journey(req)  # KeyError = procédure inconnue (→ 404 métier)
    upsert_journey_state(journey, user_id=user_id)
    record_audit(JOURNEY_RECALCULATED, journey_id=req.journeyId,
                 payload={"status": journey.status, "nextAction": journey.nextAction})
    return journey


def resume_journey(journey_id: str, user_id: str | None = None) -> JourneyResponse:
    """Reprise : relit l'état persisté puis re-dérive avec le moteur (jamais l'historique)."""
    state = load_journey_state(journey_id, user_id=user_id)
    if state is None:
        raise KeyError(f"parcours inconnu : {journey_id}")
    journey = get_journey(
        JourneyRequest(journeyId=journey_id, procedureId=state["procedureId"], documents=state["documents"])
    )
    record_audit(JOURNEY_RECALCULATED, journey_id=journey_id, payload={"source": "resume"})
    return journey