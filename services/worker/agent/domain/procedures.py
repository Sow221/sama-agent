"""Domaine Procedure — connaissance administrative structurée.

La vérité de curation vit dans `data/procedures/*.json` (référentiel CI, ADR-006).
Le domaine ne raisonne que sur des codes (enums), jamais sur du texte wolof/FR.
L'infrastructure (repositories) peut copier cette connaissance en base (PostgreSQL cible) ;
ici les lectures sont pures et déterministes.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from agent.bootstrap import DATA_DIR

PROCEDURES = DATA_DIR / "procedures"


@lru_cache(maxsize=32)
def load_procedure(procedure_id: str) -> dict:
    """Charge une procédure depuis data/procedures/<id>.json (KeyError = procédure inconnue)."""
    path = PROCEDURES / f"{procedure_id}.json"
    if not path.exists():
        raise KeyError(f"procédure inconnue : {procedure_id}")
    return json.loads(path.read_text("utf-8"))


def required_of(procedure: dict) -> list[dict]:
    """Exigences obligatoires de la procédure (règle générale) — jamais le LLM. """
    return [r for r in procedure.get("requirements", []) if r.get("required", False)]


def steps_of(procedure: dict) -> list[dict]:
    """Étapes triées par ordre — séquence officielle du parcours."""
    return sorted(procedure.get("steps", []), key=lambda s: s["order"])


def sources_of(procedure: dict) -> list[str]:
    return list(procedure.get("sources", []))