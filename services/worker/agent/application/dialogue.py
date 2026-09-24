"""Dialogue — formulation vocale/textuelle d'une décision du moteur.

Le « quoi » vient du Journey Engine (NextAction), le « comment » d'un template déterministe
ici (ou d'un LLM en formulation, référence §11) — jamais l'inverse.
Langue de l'application : FR (la voix wolof reformule — jour J xTTS).
"""
from __future__ import annotations

from agent.schemas import JourneyResponse
import enums


def formulate(journey: JourneyResponse) -> str:
    """Phrase d'application cohérente avec l'état réel calculé par le moteur."""
    if journey.nextAction == enums.NextAction.PROVIDE_PHOTOS:
        return "Il manque encore les photographies."
    if journey.nextAction == enums.NextAction.PROVIDE_DOCUMENT:
        return "Il manque encore des documents. Fournissez-les."
    if journey.status == enums.JourneyStatus.READY_FOR_NEXT_STEP:
        return "Votre dossier est complet. Prochaine étape : le service CAPP."
    return "Voici votre parcours. Suivez le dossier dans l'application."