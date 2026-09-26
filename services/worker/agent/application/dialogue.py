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


# ── Wolof parlé (voix de l'agent) ───────────────────────────────────────────
# ⚠ À RELIRE PAR UN LOCUTEUR WOLOF DE L'ÉQUIPE avant la démo. Seul ce tableau
# change : la logique (quelle phrase, quelles pièces) reste celle du moteur.
# Les nombres sont écrits en toutes lettres : un TTS lit mal les chiffres.
WOLOF = {
    "pieces": {
        "identity": "kàrtu identite bi",
        "medical": "sertifika medikal bi",
        "photos": "nataal yi",
    },
    "nombres": {0: "dara", 1: "benn", 2: "ñaar", 3: "ñett", 4: "ñeent", 5: "juróom"},
    "et": "ak",
    "pret": "Sa dossier bi mat na: {done} ci {total} lañu seet. Léegi, demal ci CAPP, ñoo koy seet ba mu wóor.",
    "a_verifier": "Fàww ñu seet {piece}: mënuñu ko jël ni mu mel. Yónnee nataal bu leer, walla nga won ko CAPP.",
    "manque": "Dafa des {pieces}. Tàmbalil ak {premier}.",
    "avance": "Sa dossier bi mu ngi dox: {done} ci {total} lañu seet.",
}


def _wo_piece(doc_id: str, fallback: str) -> str:
    return WOLOF["pieces"].get(doc_id, fallback)


def _wo_num(n: int) -> str:
    return WOLOF["nombres"].get(n, str(n))


def formulate_wolof(journey: JourneyResponse) -> str:
    """Même décision que `formulate`, dite en wolof (voix de l'agent)."""
    done, total = _wo_num(journey.completion.provided), _wo_num(journey.completion.required)
    by_id = {d.requirementId: d for d in journey.documents}
    target_doc = by_id.get(journey.nextActionRequirement or "")
    target = _wo_piece(target_doc.requirementId, target_doc.name or "") if target_doc else None

    if journey.status == enums.JourneyStatus.READY_FOR_NEXT_STEP:
        return WOLOF["pret"].format(done=done, total=total)
    if journey.nextAction == enums.NextAction.REVIEW_DOCUMENT and target:
        return WOLOF["a_verifier"].format(piece=target)
    missing = [_wo_piece(d.requirementId, d.name or "") for d in journey.documents
               if d.status == enums.DocumentStatus.MISSING]
    if missing:
        pieces = missing[0] if len(missing) == 1 else ", ".join(missing[:-1]) + f" {WOLOF['et']} " + missing[-1]
        return WOLOF["manque"].format(pieces=pieces, premier=target or missing[0])
    return WOLOF["avance"].format(done=done, total=total)
