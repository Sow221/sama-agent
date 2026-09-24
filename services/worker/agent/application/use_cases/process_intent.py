"""Use case : comprendre une demande libre → intention structurée (contrat C §64).

Live : GLM-5.3-Flash (provider, prompt versionné intent:v2 / system:v1), sortie validée
Pydantic ; sortie invalide → clarification honnête (confiance 0.0, jamais fabriquée).
Deterministic (Version B, C §54) : règles FR/wolof sur mots-clés, confiance explicite.
"""
from __future__ import annotations

from pydantic import ValidationError

from agent import mode as app_mode
from agent.schemas import IntentRequest, IntentResponse
from agent.infrastructure.llm.glm import GlmLlm
from agent.infrastructure.prompts import load_prompt
import enums

# Règles FR/wolof (mode déterministe uniquement — explicites, honnêtes, pas de LLM)
_KEYWORDS = {
    "permis": True, "conduire": True, "conducteur": True,
    "bëgg": True, "permis de conduire": True, "dëgg": True, "jay": True,
}


def _clarify(req: IntentRequest, message: str) -> IntentResponse:
    return IntentResponse(
        intent=enums.Intent.driving_license,
        action=enums.IntentAction.unknown,
        language=req.language or enums.Language.FR,
        confidence=0.0,
        needsClarification=True,
        clarificationQuestion=message,
    )


def infer_intent(req: IntentRequest, llm: GlmLlm | None = None) -> IntentResponse:
    """Chaîne réelle en mode live ; règles déterministes en mode deterministic."""
    if app_mode.is_live():
        if llm is None:
            llm = GlmLlm()
        prompt = load_prompt("intent", "v2").format(
            transcript=req.transcript,
            intent=", ".join(enums.Intent),
            action=", ".join(enums.IntentAction),
            language=", ".join(enums.Language),
        )
        raw = llm.chat_json(prompt, system=load_prompt("system", "v1"))
        try:
            return IntentResponse.model_validate(raw)
        except ValidationError:
            # Sortie LLM invalide → clarification honnête, pas de fabrication.
            return _clarify(req, "Pouvez-vous préciser votre demande ?")

    # mode deterministic : règles de mots-clés FR/wolof
    t = req.transcript.lower()
    hit = next((k for k in _KEYWORDS if k in t), None)
    if hit:
        return IntentResponse(
            intent=enums.Intent.driving_license,
            action=enums.IntentAction.new_application,
            language=req.language or enums.Language.FR,
            confidence=0.6,
            needsClarification=False,
        )
    return _clarify(req, "Pouvez-vous préciser votre demande ?")