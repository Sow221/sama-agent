"""Dialogue — formulation vocale/textuelle d'une décision du moteur.

Le « quoi » vient du Journey Engine (NextAction, statuts, noms des pièces), le
« comment » d'un template déterministe ici (ou d'un LLM en formulation,
référence §11) — jamais l'inverse. Chaque phrase nomme les pièces réelles du
dossier : l'usager sait quoi faire sans ouvrir l'application.
Langue de l'application : FR (la voix wolof reformule — jour J xTTS).
"""
from __future__ import annotations

from agent.schemas import JourneyResponse
import enums


def _names(journey: JourneyResponse, *statuses: enums.DocumentStatus) -> list[str]:
    return [d.name or d.requirementId for d in journey.documents if d.status in statuses]


def _join(items: list[str]) -> str:
    return items[0] if len(items) == 1 else ", ".join(items[:-1]) + " et " + items[-1]


def formulate(journey: JourneyResponse) -> str:
    """Phrase d'application cohérente avec l'état réel calculé par le moteur."""
    done, total = journey.completion.provided, journey.completion.required
    target = next(
        (d.name or d.requirementId for d in journey.documents
         if d.requirementId == journey.nextActionRequirement),
        None,
    )

    if journey.status == enums.JourneyStatus.READY_FOR_NEXT_STEP:
        return (
            f"Votre dossier est complet : {done} pièces sur {total} analysées. "
            "Prochaine étape : présentez-le au service CAPP, qui fait la vérification officielle."
        )
    if journey.nextAction == enums.NextAction.REVIEW_DOCUMENT and target:
        return (
            f"La pièce « {target} » doit être vérifiée : l'analyse ne permet pas de la retenir "
            "telle quelle. Remplacez-la par une photo nette, ou faites-la contrôler par le service."
        )
    missing = _names(journey, enums.DocumentStatus.MISSING)
    if missing:
        first = f" Commencez par : {target}." if target else ""
        return f"Il vous manque encore {_join(missing)} ({done} sur {total} analysées).{first}"
    return f"Votre dossier avance : {done} pièces sur {total} analysées. Suivez-le dans l'application."
