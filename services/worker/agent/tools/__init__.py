"""Frontière LLM ↔ système (référence §5.4) — « le modèle orchestre, le système exécute ».

  definitions.py   définitions JSON-schema présentées à GLM (function calling)
  dispatcher.py    Tool Dispatcher : nom d'outil → exécuteur → résultat tracé (latence, statut)
                   (le modèle peut DEMANDER, seul le dispatcher EXÉCUTE — jamais le LLM)
  tools/           exécuteurs réels (use cases applicatifs + domaine déterministe)

Chaque appel est tracé (tool_calls : nom, arguments, résultat, statut, latence —
persistance en table `tool_calls` au ticket PERS-3).
"""
from __future__ import annotations

from agent.tools.definitions import GLM_TOOLS
from agent.tools.dispatcher import ToolDispatcher, ToolTrace, dispatcher, execute_tool

__all__ = ["GLM_TOOLS", "ToolDispatcher", "ToolTrace", "dispatcher", "execute_tool"]