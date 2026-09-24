"""Outil « procédure » — connaissance administrative structurée (data/procedures)."""
from __future__ import annotations

from agent.domain.procedures import load_procedure, required_of, sources_of, steps_of


def get_procedure(arguments: dict) -> dict:
    procedure_id = arguments["procedure_id"]
    procedure = load_procedure(procedure_id)  # KeyError → statut failed lisible (jamais inventé)
    return {
        "procedureId": procedure["id"],
        "name": procedure.get("name"),
        "required": required_of(procedure),
        "steps": steps_of(procedure),
        "sources": sources_of(procedure),
    }