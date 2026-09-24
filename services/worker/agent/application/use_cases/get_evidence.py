"""Use case : obtenir la preuve/source d'une exigence (C §66, déterministe)."""
from __future__ import annotations

from agent.domain import evidence
from agent.schemas import Evidence


def get_evidence(requirement: str, procedure_id: str | None = None) -> Evidence:
    return evidence.lookup(requirement, procedure_id)