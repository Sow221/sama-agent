"""Use case : un tour de la boucle vocale (agent voix).

Intent (LLM/règles) → Journey (déterministe) → réponse formulée (dialogue).
La décision administrative vient du moteur ; le formulaire ne fait que dire l'état réel.
"""
from __future__ import annotations

from agent.schemas import IntentRequest
from agent.application.dialogue import formulate
from agent.application.use_cases.process_intent import infer_intent
from agent.application.use_cases.persist_journey import resume_journey


def process_voice_turn(text: str, journey_id: str) -> str:
    """Le dossier est relu en base (procédure + documents persistés) : un dossier
    par-usager (`driving_license_new-<id>`) n'est pas un identifiant de procédure.
    KeyError si le dossier n'existe pas — le worker le remonte en agent_error."""
    intent = infer_intent(IntentRequest(transcript=text, language=None))
    if intent.needsClarification:
        return intent.clarificationQuestion or "Pouvez-vous préciser votre demande ?"
    journey = resume_journey(journey_id)
    return formulate(journey)