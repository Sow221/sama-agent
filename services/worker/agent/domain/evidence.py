"""Domaine Evidence — relie une exigence à sa source et à ses limites (C §66).

Répond à « pourquoi Sama Agent affirme cela ? » : Requirement → Claim → Source.
La preuve vient de la donnée (data/evidence + sources), jamais d'une justification
inventée par le LLM après coup.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from agent.bootstrap import DATA_DIR
from agent.schemas import Evidence

EVIDENCE_DIR = DATA_DIR / "evidence"


@lru_cache(maxsize=32)
def lookup(requirement: str, procedure_id: str | None = None) -> Evidence:
    path = EVIDENCE_DIR / f"{requirement}.json"
    if not path.exists():
        raise KeyError(f"aucune preuve pour {requirement!r}")
    data = json.loads(path.read_text("utf-8"))
    return Evidence(
        requirement=requirement,
        procedureId=data.get("procedureId", procedure_id or "driving_license_new"),
        source=data["source"],
        sourceUrl=data.get("sourceUrl"),
        description=data["description"],
        limitations=data.get("limitations", []),
    )