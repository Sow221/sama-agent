"""
Journey Engine — MOTEUR DÉTERMINISTE (ADR-005/006), cœur du produit.
- Agnostique langue : raisonne sur des codes (enums), jamais sur du texte wolof/FR.
- La completion est TOUJOURS dérivée (G3) — jamais lue depuis un client.
- Lookup des procédures dans data/procedures/*.json (vérité CI).
Règles pures → unit-testables (14 cas C §53, trouvés dans la matrice).
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from agent.bootstrap import DATA_DIR
from agent.schemas import Completion, JourneyDocument, JourneyRequest, JourneyResponse, JourneyStep
import enums

PROCEDURES = DATA_DIR / "procedures"


@lru_cache(maxsize=32)
def load_procedure(procedure_id: str) -> dict:
    path = PROCEDURES / f"{procedure_id}.json"
    if not path.exists():
        raise KeyError(f"procédure inconnue : {procedure_id}")
    return json.loads(path.read_text("utf-8"))


def _step_status(order: int, docs: list[JourneyDocument], required: list[dict]) -> str:
    """Étapes : Comprendre ✓ toujours ; Préparer active tant qu'un élément manque ;
    Vérifier/Agir suivent."""
    if order == 1:
        return "done"
    prepared = all(
        any(d.requirementId == r["id"] and d.status == enums.DocumentStatus.ANALYZED for d in docs)
        for r in required
    )
    if order == 2:
        return "done" if prepared else "active"
    return "done" if prepared else "todo"


def _next_action(status: enums.JourneyStatus, docs: list[JourneyDocument], required: list[dict]) -> tuple[enums.NextAction | None, str | None]:
    """Règles de prochaine action (ADR-006, G13 : PROVIDE_PHOTOS dédié aux photos)."""
    for d in docs:
        if d.status == enums.DocumentStatus.MISSING:
            req = next((r for r in required if r["id"] == d.requirementId), None)
            if req and "photo" in [t for t in req.get("acceptedTypes", [])]:
                return enums.NextAction.PROVIDE_PHOTOS, d.requirementId
            return enums.NextAction.PROVIDE_DOCUMENT, d.requirementId
    for d in docs:
        if d.status in (enums.DocumentStatus.NEEDS_REVIEW, enums.DocumentStatus.UNEXPECTED):
            return enums.NextAction.REVIEW_DOCUMENT, d.requirementId
    if status == enums.JourneyStatus.READY_FOR_NEXT_STEP:
        return enums.NextAction.CONTACT_SERVICE, None
    return enums.NextAction.READ_INFORMATION, None


def resolve(req: JourneyRequest) -> JourneyResponse:
    """Pur : même entrée → même sortie. Aucun appel réseau."""
    procedure = load_procedure(req.procedureId or req.journeyId)
    required: list[dict] = [r for r in procedure["requirements"] if r.get("required", False)]

    docs = [JourneyDocument(**d) for d in req.documents or []] if req.documents else [
        JourneyDocument(requirementId=r["id"], name=r["name"], status=enums.DocumentStatus.MISSING)
        for r in required
    ]
    # Complète les documents manquants de la procédure (état réel côté serveur, stateless).
    known = {d.requirementId for d in docs}
    for r in required:
        if r["id"] not in known:
            docs.append(JourneyDocument(requirementId=r["id"], name=r["name"], status=enums.DocumentStatus.MISSING))

    provided = sum(1 for d in docs if d.status == enums.DocumentStatus.ANALYZED)
    required_count = len(required)

    # Statut (ordre : pire d'abord, jamais plus optimiste que la vérité)
    if any(d.status == enums.DocumentStatus.MISSING for d in docs):
        status = enums.JourneyStatus.NEEDS_DOCUMENT
    elif any(d.status in (enums.DocumentStatus.NEEDS_REVIEW, enums.DocumentStatus.UNEXPECTED) for d in docs):
        status = enums.JourneyStatus.NEEDS_REVIEW
    elif provided == required_count:
        status = enums.JourneyStatus.READY_FOR_NEXT_STEP
    else:
        status = enums.JourneyStatus.IN_PROGRESS

    steps = [
        JourneyStep(id=s["id"], name=s["name"], order=s["order"], status=_step_status(s["order"], docs, required))
        for s in sorted(procedure["steps"], key=lambda s: s["order"])
    ]
    next_action, next_requirement = _next_action(status, docs, required)

    return JourneyResponse(
        journeyId=req.journeyId,
        procedureId=procedure["id"],
        status=status,
        steps=steps,
        completion=Completion(provided=provided, required=required_count),
        documents=docs,
        nextAction=next_action,
        nextActionRequirement=next_requirement,
    )