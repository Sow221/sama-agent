"""Journey Engine — MOTEUR DÉTERMINISTE (ADR-005/006), cœur du produit.
- Agnostique langue : raisonne sur des codes (enums), jamais sur du texte wolof/FR.
- La completion est TOUJOURS dérivée (G3) — jamais lue depuis un client.
- Labels/raisons de NextAction : source unique enums.json (parité TS ≡ Python ≡ JSON).

PRIORITÉ EXPLICITE DES ÉTATS (point 11 — jamais plus optimiste que la vérité) :
    1. NEEDS_REVIEW     — un document suspect/à vérifier bloque tout (prioritaire)
    2. NEEDS_DOCUMENT   — une exigence manquante bloque
    3. IN_PROGRESS      — partiellement préparé
    4. READY_FOR_NEXT_STEP — complet
La prochaine action suit la même priorité (REVIEW_DOCUMENT > PROVIDE_* > CONTACT_SERVICE).
Règles pures → unit-testables (matrice C §53 + cas du plan de validation).
Le domaine ne dépend d'aucun modèle IA ni d'aucune base (règle de la référence).
"""
from __future__ import annotations

from agent.domain.procedures import load_procedure, required_of, steps_of
from agent.domain.actions import SUSPECT_STATUSES, label_of, resolve_next_action
from agent.schemas import Completion, JourneyDocument, JourneyRequest, JourneyResponse, JourneyStep
import enums


def _step_status(order: int, docs: list[JourneyDocument], required: list[dict]) -> str:
    """Étapes (point 20 — où suis-je ?) :
      Comprendre ✓ toujours ; Préparer active tant qu'un élément manque ;
      Vérifier active dès que le dossier est prêt (l'usager y accède) ; Agir reste à venir."""
    if order == 1:
        return "done"
    prepared = all(
        any(d.requirementId == r["id"] and d.status == enums.DocumentStatus.ANALYZED for d in docs)
        for r in required
    )
    if order == 2:
        return "done" if prepared else "active"
    if order == 3:
        return "active" if prepared else "todo"
    return "todo"


def _first_doc(docs: list[JourneyDocument], *statuses: enums.DocumentStatus) -> JourneyDocument | None:
    """Premier document dans l'ordre de la procédure portant l'un des statuts donnés."""
    for d in docs:
        if d.status in statuses:
            return d
    return None


def resolve(req: JourneyRequest) -> JourneyResponse:
    """Pur : même entrée → même sortie. Aucun appel réseau, aucun modèle."""
    procedure = load_procedure(req.procedureId or req.journeyId)
    required: list[dict] = required_of(procedure)

    docs = (
        [d if isinstance(d, JourneyDocument) else JourneyDocument(**d) for d in req.documents]
        if req.documents
        else []
    )
    # Complète les documents manquants de la procédure (état réel côté serveur).
    known = {d.requirementId for d in docs}
    for r in required:
        if r["id"] not in known:
            docs.append(JourneyDocument(requirementId=r["id"], name=r["name"], status=enums.DocumentStatus.MISSING))
    # Contrat de sortie : `name` TOUJOURS présent (le serveur est propriétaire de la donnée).
    name_by_id = {r["id"]: r["name"] for r in required}
    for d in docs:
        if not d.name:
            d.name = name_by_id.get(d.requirementId)

    provided = sum(1 for d in docs if d.status == enums.DocumentStatus.ANALYZED)
    required_count = len(required)

    # Statut — priorité explicite (jamais plus optimiste que la vérité).
    if _first_doc(docs, *SUSPECT_STATUSES):
        status = enums.JourneyStatus.NEEDS_REVIEW
    elif _first_doc(docs, enums.DocumentStatus.MISSING):
        status = enums.JourneyStatus.NEEDS_DOCUMENT
    elif provided == required_count:
        status = enums.JourneyStatus.READY_FOR_NEXT_STEP
    else:
        status = enums.JourneyStatus.IN_PROGRESS

    steps = [
        JourneyStep(id=s["id"], name=s["name"], order=s["order"], status=_step_status(s["order"], docs, required))
        for s in steps_of(procedure)
    ]
    next_action, next_requirement = resolve_next_action(docs, required)

    # Cas READY : le moteur déduit CONTACT_SERVICE (procédure complète).
    if status == enums.JourneyStatus.READY_FOR_NEXT_STEP:
        next_action, next_requirement = enums.NextAction.CONTACT_SERVICE, None

    return JourneyResponse(
        journeyId=req.journeyId,
        procedureId=procedure["id"],
        status=status,
        steps=steps,
        completion=Completion(provided=provided, required=required_count),
        documents=docs,
        nextAction=next_action,
        nextActionRequirement=next_requirement,
        nextActionLabel=label_of(enums.NextActionLabel, next_action),
        nextActionReason=label_of(enums.NextActionReason, next_action),
    )