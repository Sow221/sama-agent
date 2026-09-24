"""Domaine Action — résolution déterministe de la prochaine action (ADR-006).

Le « quoi faire » vient du MOTEUR : enums.NextAction (source unique enums.json).
Le « comment le dire » (formulation) relève de l'application (template ou LLM).

Priorité explicite (point 11 — jamais plus optimiste que la vérité) :
   1. REVIEW_DOCUMENT  — un document suspect/à vérifier prime
   2. PROVIDE_DOCUMENT / PROVIDE_PHOTOS — une exigence manquante bloque
   3. READ_INFORMATION — cas nominal
   (CONTACT_SERVICE est déduit par le Journey Engine quand le dossier est complet.)
"""
from __future__ import annotations

from agent.schemas import JourneyDocument
import enums

# Statuts qui exigent une vérification humaine (priorité 1 sur le parcours).
SUSPECT_STATUSES = (enums.DocumentStatus.NEEDS_REVIEW, enums.DocumentStatus.UNEXPECTED)


def label_of(kind: type, action: enums.NextAction | None) -> str | None:
    """Label/raison d'une NextAction — source unique enums.json, jamais reconstruit côté front."""
    if action is None:
        return None
    member = getattr(kind, action.value, None)
    return member.value if member is not None else None


def is_photos_requirement(req: dict) -> bool:
    return "photo" in [t for t in req.get("acceptedTypes", [])]


def _first_doc(docs: list[JourneyDocument], *statuses: enums.DocumentStatus) -> JourneyDocument | None:
    """Premier document (ordre procédure) portant l'un des statuts donnés."""
    for d in docs:
        if d.status in statuses:
            return d
    return None


def resolve_next_action(
    docs: list[JourneyDocument], required: list[dict]
) -> tuple[enums.NextAction | None, str | None]:
    """Prochaine action — même priorité que le statut du parcours (point 12)."""
    # 1. Un document suspect prime (ne jamais paraître plus prêt que la vérité).
    suspect = _first_doc(docs, enums.DocumentStatus.NEEDS_REVIEW, enums.DocumentStatus.UNEXPECTED)
    if suspect:
        return enums.NextAction.REVIEW_DOCUMENT, suspect.requirementId
    # 2. Une exigence manquante bloque.
    missing = _first_doc(docs, enums.DocumentStatus.MISSING)
    if missing:
        req = next((r for r in required if r["id"] == missing.requirementId), None)
        if req and is_photos_requirement(req):
            return enums.NextAction.PROVIDE_PHOTOS, missing.requirementId
        return enums.NextAction.PROVIDE_DOCUMENT, missing.requirementId
    # 3+4. Rien de manquant ni de suspect → lire les informations (nominal).
    return enums.NextAction.READ_INFORMATION, None