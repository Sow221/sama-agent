"""Agent orchestrator — un tour de la boucle vocale réelle (ADR-004/005).

Le modèle orchestre (intent), le système exécute (Journey), le template formule.
Aucune règle métier ici : tout est porté par les use cases.
"""
from __future__ import annotations

from agent.application.use_cases.process_voice import VoiceReply, process_voice_turn


def voice_turn(text: str, journey_id: str, history: list[dict] | None = None) -> VoiceReply:
    """Un tour complet : ASR (fait par l'appelant) → réponse du LLM (dossier + historique)."""
    return process_voice_turn(text, journey_id, history=history)