"""
LLM client NVIDIA Build (ADR-005) — GLM-5.3-Flash.
Prompt d'intent → sortie JSON validée Pydantic (jamais de JSON non structuré, B §15).
Fallback déterministe honnête en mode "deterministic" (C §54) : règles FR/wolof sur mots-clés.
"""
from __future__ import annotations

import json
import os

import httpx
from pydantic import ValidationError

from agent import mode as app_mode
from agent.schemas import IntentRequest, IntentResponse
import enums

PROMPT_INTENT = """Tu es l'agent d'orientation administrative du Sénégal (Sama Agent).
L'utilisateur parle en wolof (transcription ASR réelle) ou en français.
Détermine l'intention et l'action parmi les valeurs EXACTES de l'enum suivant :
intent ∈ {intent}; action ∈ {action}; language ∈ {language}.
Réponds UNIQUEMENT en JSON : {{"intent","action","language","confidence"(0..1),
"needsClarification"(bool),"clarificationQuestion"(str|null),"transcript"(transcription corrigée)}}.

Demande : {transcript}"""

# Règles FR/wolof (mode déterministe uniquement — explicites, honnêtes, pas de LLM)
_KEYWORDS = {
    "permis": True, "conduire": True, "conducteur": True,
    "bëgg": True, "permis de conduire": True, "dëgg": True, "jay": True,
}


class LlmUnavailableError(RuntimeError):
    pass


class GlmLlm:
    def __init__(self) -> None:
        self.base_url = os.getenv("NVIDIA_BASE_URL", "").rstrip("/")
        self.api_key = os.getenv("NVIDIA_API_KEY", "")
        self.model = os.getenv("NVIDIA_MODEL", "glm-5.3-flash")
        self._httpx = httpx.Client(timeout=60)

    def chat_json(self, prompt: str) -> dict:
        if not self.base_url or not self.api_key:
            raise LlmUnavailableError("NVIDIA_BASE_URL / NVIDIA_API_KEY manquants")
        r = self._httpx.post(
            f"{self.base_url}/chat/completions",
            headers={"Authorization": f"Bearer {self.api_key}"},
            json={
                "model": self.model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0,
                "response_format": {"type": "json_object"},
            },
        )
        r.raise_for_status()
        content = r.json()["choices"][0]["message"]["content"]
        return json.loads(content)

    def chat_json_multimodal(self, prompt: str, content_parts: list[dict]) -> dict:
        """Entrée visuelle réelle (image) pour l'analyse documentaire."""
        if not self.base_url or not self.api_key:
            raise LlmUnavailableError("NVIDIA_BASE_URL / NVIDIA_API_KEY manquants")
        r = self._httpx.post(
            f"{self.base_url}/chat/completions",
            headers={"Authorization": f"Bearer {self.api_key}"},
            json={
                "model": self.model,
                "messages": [
                    {"role": "user", "content": [{"type": "text", "text": prompt}, *content_parts]}
                ],
                "temperature": 0,
                "response_format": {"type": "json_object"},
            },
        )
        r.raise_for_status()
        content = r.json()["choices"][0]["message"]["content"]
        return json.loads(content)

    def close(self) -> None:
        self._httpx.close()


def infer_intent(req: IntentRequest, llm: GlmLlm | None = None) -> IntentResponse:
    """Chaîne réelle en mode live ; règles déterministes en mode deterministic."""
    if app_mode.is_live():
        if llm is None:
            llm = GlmLlm()
        prompt = PROMPT_INTENT.format(
            transcript=req.transcript,
            intent=", ".join(enums.Intent),
            action=", ".join(enums.IntentAction),
            language=", ".join(enums.Language),
        )
        raw = llm.chat_json(prompt)
        try:
            return IntentResponse.model_validate(raw)
        except ValidationError:
            # Sortie LLM invalide → clarification honnête, pas de fabrication.
            return IntentResponse(
                intent=enums.Intent.driving_license,
                action=enums.IntentAction.unknown,
                language=req.language or enums.Language.WO,
                confidence=0.0,
                needsClarification=True,
            )

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
    return IntentResponse(
        intent=enums.Intent.driving_license,
        action=enums.IntentAction.unknown,
        language=req.language or enums.Language.FR,
        confidence=0.2,
        needsClarification=True,
        clarificationQuestion="Pouvez-vous préciser votre demande ?",
    )