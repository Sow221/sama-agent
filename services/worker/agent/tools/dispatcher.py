"""Tool Dispatcher — frontière exécutive LLM ↔ système (référence §5.4).

Le modèle (ou la boucle) fournit un nom d'outil + arguments JSON ; le dispatcher :
  1. résout l'exécuteur enregistré (le système seul exécute — jamais le LLM),
  2. mesure la latence et trace la tentative (tool_calls : statut, erreur, résultat),
  3. normalize la réponse {tool, status, latencyMs, result|error}.
Les erreurs métier (procédure inconnue…) sont des statuts `failed` lisibles, pas des exceptions.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Callable

ToolExecutor = Callable[[dict], dict]


@dataclass
class ToolTrace:
    """Trace d'UN appel d'outil — les champs de la table tool_calls (référence §7.3)."""

    tool_name: str
    arguments: dict
    status: str  # success | failed
    latency_ms: float
    result: dict | None = None
    error: str | None = None
    session_id: str | None = None


class UnknownToolError(KeyError):
    pass


class ToolDispatcher:
    """Registre nominatif : un nom → UN exécuteur. Aucun nom magique, aucun import dynamique."""

    def __init__(self, trace_sink: Callable[[ToolTrace], None] | None = None) -> None:
        self._executors: dict[str, ToolExecutor] = {}
        self.traces: list[ToolTrace] = []
        self._trace_sink = trace_sink

    def register(self, name: str, fn: ToolExecutor) -> None:
        if name in self._executors:
            raise ValueError(f"outil déjà enregistré : {name!r}")
        self._executors[name] = fn

    @property
    def names(self) -> list[str]:
        return sorted(self._executors)

    def execute(self, tool_name: str, arguments: dict, session_id: str | None = None) -> dict:
        started = time.perf_counter()
        fn = self._executors.get(tool_name)
        if fn is None:
            raise UnknownToolError(f"outil inconnu : {tool_name}")
        trace = ToolTrace(
            tool_name=tool_name,
            arguments=dict(arguments),
            status="failed",
            latency_ms=0.0,
            session_id=session_id,
        )
        try:
            result = fn(arguments)
            trace.status = "success"
            trace.result = result
        except Exception as exc:
            trace.error = str(exc)
        finally:
            trace.latency_ms = round((time.perf_counter() - started) * 1000, 2)
            self.traces.append(trace)
            if self._trace_sink is not None:
                self._trace_sink(trace)

        if trace.result is not None:
            return {"tool": tool_name, "status": trace.status, "latencyMs": trace.latency_ms, "result": trace.result}
        return {"tool": tool_name, "status": trace.status, "latencyMs": trace.latency_ms, "error": trace.error}


# Exécuteurs réels — le dispatcher ne connaît que leurs noms (pas d'implémentation).
def _register_defaults() -> ToolDispatcher:
    d = ToolDispatcher()
    from agent.tools.tools.journey import get_journey_state, get_missing_requirements, get_next_action
    from agent.tools.tools.procedure import get_procedure
    from agent.tools.tools.evidence import get_evidence
    from agent.tools.tools.document import analyze_document

    d.register("get_journey_state", get_journey_state)
    d.register("get_missing_requirements", get_missing_requirements)
    d.register("get_next_action", get_next_action)
    d.register("get_procedure", get_procedure)
    d.register("get_evidence", get_evidence)
    d.register("analyze_document", analyze_document)
    return d


dispatcher = _register_defaults()


def execute_tool(tool_name: str, arguments: dict, session_id: str | None = None) -> dict:
    """Point d'entrée de la boucle (orchestrateur / GLM tool calling) — normalisé + tracé."""
    return dispatcher.execute(tool_name, arguments, session_id=session_id)