"""Use case : un tour de la boucle vocale (agent voix).

Intent (LLM/règles) → Journey (déterministe) → réponse formulée (dialogue).
La décision administrative vient du moteur ; le formulaire ne fait que dire l'état réel.
"""
from __future__ import annotations

from agent.schemas import IntentRequest, JourneyDocument, JourneyRequest
from agent.application.dialogue import formulate
from agent.application.use_cases.process_intent import infer_intent
from agent.application.use_cases.get_journey import get_journey


def process_voice_turn(
    text: str, journey_id: str, documents: list[JourneyDocument] | None = None
) -> str:
    intent = infer_intent(IntentRequest(transcript=text, language=None))
    if intent.needsClarification:
        return intent.clarificationQuestion or "Pouvez-vous préciser votre demande ?"
    journey = get_journey(JourneyRequest(journeyId=journey_id, documents=documents))
    return formulate(journey)