"""Use cases applicatifs — un fichier = un cas d'utilisation (référence §7).
Le façade ré-exporte les FONCTIONS ; les modules importent toujours depuis leur
fichier (évite l'ambiguïté nom de module / nom de fonction)."""
from agent.application.use_cases.process_intent import infer_intent
from agent.application.use_cases.get_journey import get_journey
from agent.application.use_cases.analyze_document import analyze_document
from agent.application.use_cases.get_evidence import get_evidence
from agent.application.use_cases.process_voice import process_voice_turn
from agent.application.use_cases.persist_journey import apply_journey, resume_journey
from agent.application.use_cases.persist_analysis import persist_document_analysis
from agent.application.use_cases.agent_turn import run_agent_turn, run_tool_loop

__all__ = [
    "infer_intent",
    "get_journey",
    "analyze_document",
    "get_evidence",
    "process_voice_turn",
    "apply_journey",
    "resume_journey",
    "persist_document_analysis",
    "run_agent_turn",
    "run_tool_loop",
]