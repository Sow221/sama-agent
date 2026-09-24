"""Outil « preuve » — « d'où vient cette affirmation ? » (C §66, domaine evidence)."""
from __future__ import annotations

from agent.application.use_cases.get_evidence import get_evidence as get_evidence_uc


def get_evidence(arguments: dict) -> dict:
    requirement = arguments["requirement"]
    return get_evidence_uc(requirement).model_dump()  # KeyError → failed lisible