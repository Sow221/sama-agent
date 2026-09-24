"""Use case : calculer / recalculer l'état du parcours (Journey Engine — déterministe).

Le moteur ne parle à aucun modèle : il lit la procédure (data/ + repositories) et les
documents fournis, et dérive statut / progression / NextAction (G3 + point 11/12).
"""
from __future__ import annotations

from agent.domain import journey_engine
from agent.schemas import JourneyRequest, JourneyResponse


def get_journey(req: JourneyRequest) -> JourneyResponse:
    return journey_engine.resolve(req)