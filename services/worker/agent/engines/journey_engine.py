"""
Journey Engine — MOTEUR DÉTERMINISTE (ADR-005/006), cœur du produit.
- Agnostique langue : raisonne sur des codes (enums), jamais sur du texte wolof/FR.
- La completion est TOUJOURS dérivée (G3) — jamais lue depuis un client.
- Lookup des procédures dans data/procedures/*.json (vérité CI).
- Labels/raisons de NextAction : source unique enums.json (parité TS ≡ Python ≡ JSON).

PRIORITÉ EXPLICITE DES ÉTATS (point 11 — jamais plus optimiste que la vérité) :
    1. NEEDS_REVIEW     — un document suspect/à vérifier bloque tout (prioritaire)
    2. NEEDS_DOCUMENT   — une exigence manquante bloque
    3. IN_PROGRESS      — partiellement préparé
    4. READY_FOR_NEXT_STEP — complet
La prochaine action suit la même priorité (REVIEW_DOCUMENT > PROVIDE_* > CONTACT_SERVICE).
Règles pures → unit-testables (matrice C §53 + cas du plan de validation).
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from agent.bootstrap import DATA_DIR
from agent.schemas import Completion, JourneyDocument, JourneyRequest, JourneyResponse, JourneyStep
import enums

PROCEDURES = DATA_DIR / "procedures"

# Statuts qui exigent une vérification humaine (priorité 1 sur le parcours).
_SUSPECT_STATUSES = (enums.DocumentStatus.NEEDS_REVIEW, enums.DocumentStatus.UNEXPECTED)


@lru_cache(maxsize=32)
def load_procedure(procedure_id: str) -> dict:
    path = PROCEDURES / f"{procedure_id}.json"
    if not path.exists():
        raise KeyError(f"procédure inconnue : {procedure_id}")
    return json.loads(path.read_text("utf-8"))


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


def _is_photos_requirement(req: dict) -> bool:
    return "photo" in [t for t in req.get("acceptedTypes", [])]


def _label_of(kind: type[enums.NextAction], action: enums.NextAction | None) -> str | None:
    """Label/raison de la NextAction — source unique enums.json (jamais reconstruit côté front)."""
    if action is None:
        return None
    member = getattr(kind, action.value, None)
    return member.value if member is not None else None


def _next_action(docs: list[JourneyDocument], required: list[dict]) -> tuple[enums.NextAction | None, str | None]:
    """Prochaine action — MÊME priorité que le statut (point 12 : unique, liée à l'état, justifiée)."""
    # 1. Un document suspect prime (ne jamais paraître plus prêt que la vérité).
    suspect = _first_doc(docs, enums.DocumentStatus.NEEDS_REVIEW, enums.DocumentStatus.UNEXPECTED)
    if suspect:
        return enums.NextAction.REVIEW_DOCUMENT, suspect.requirementId
    # 2. Une exigence manquante bloque.
    missing = _first_doc(docs, enums.DocumentStatus.MISSING)
    if missing:
        req = next((r for r in required if r["id"] == missing.requirementId), None)
        if req and _is_photos_requirement(req):
            return enums.NextAction.PROVIDE_PHOTOS, missing.requirementId
        return enums.NextAction.PROVIDE_DOCUMENT, missing.requirementId
    # 3+4. Complet → passer au service ; sinon lire les informations.
    return enums.NextAction.READ_INFORMATION, None


def resolve(req: JourneyRequest) -> JourneyResponse:
    """Pur : même entrée → même sortie. Aucun appel réseau."""
    procedure = load_procedure(req.procedureId or req.journeyId)
    required: list[dict] = [r for r in procedure["requirements"] if r.get("required", False)]

    docs = (
        [d if isinstance(d, JourneyDocument) else JourneyDocument(**d) for d in req.documents]
        if req.documents
        else [
            JourneyDocument(requirementId=r["id"], name=r["name"], status=enums.DocumentStatus.MISSING)
            for r in required
        ]
    )
    # Complète les documents manquants de la procédure (état réel côté serveur, stateless).
    known = {d.requirementId for d in docs}
    for r in required:
        if r["id"] not in known:
            docs.append(JourneyDocument(requirementId=r["id"], name=r["name"], status=enums.DocumentStatus.MISSING))
    # Contrat de sortie : `name` ALWAYS présent (le serveur est propriétaire de la donnée).
    name_by_id = {r["id"]: r["name"] for r in required}
    for d in docs:
        if not d.name:
            d.name = name_by_id.get(d.requirementId)

    provided = sum(1 for d in docs if d.status == enums.DocumentStatus.ANALYZED)
    required_count = len(required)

    # Statut — priorité explicite (jamais plus optimiste que la vérité).
    if _first_doc(docs, *(_SUSPECT_STATUSES)):
        status = enums.JourneyStatus.NEEDS_REVIEW
    elif _first_doc(docs, enums.DocumentStatus.MISSING):
        status = enums.JourneyStatus.NEEDS_DOCUMENT
    elif provided == required_count:
        status = enums.JourneyStatus.READY_FOR_NEXT_STEP
    else:
        status = enums.JourneyStatus.IN_PROGRESS

    steps = [
        JourneyStep(id=s["id"], name=s["name"], order=s["order"], status=_step_status(s["order"], docs, required))
        for s in sorted(procedure["steps"], key=lambda s: s["order"])
    ]
    next_action, next_requirement = _next_action(docs, required)

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
        nextActionLabel=_label_of(enums.NextActionLabel, next_action),
        nextActionReason=_label_of(enums.NextActionReason, next_action),
    )