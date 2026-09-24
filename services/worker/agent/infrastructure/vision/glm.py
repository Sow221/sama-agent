"""Vision provider (infrastructure) — GLM-5.3-Flash multimodal → DocumentObservation.

Le provider OBSERVE (contenu, lisibilité, correspondance) ; il ne classe pas :
la classification (statuts, ANALYZED ≠ VALIDATED) vit dans le domaine (document.py).
"""
from __future__ import annotations

import base64

from agent.infrastructure.llm.glm import GlmLlm, LlmUnavailableError
from agent.infrastructure.prompts import load_prompt
from agent.domain.document import DocumentObservation


class GlmVisionProvider:
    def __init__(self, llm: GlmLlm | None = None) -> None:
        self._llm = llm or GlmLlm()

    def analyze(self, file_bytes: bytes, content_type: str) -> DocumentObservation:
        if not content_type.startswith("image/"):
            raise ValueError("format non image — le domaine le traite en NEEDS_REVIEW honnête")
        prompt = load_prompt("document", "v1")
        payload = {
            "type": "image_url",
            "image_url": {
                "url": f"data:{content_type};base64,{base64.b64encode(file_bytes).decode()}"
            },
        }
        raw = self._llm.chat_json_multimodal(prompt, [payload])
        return DocumentObservation(
            content_type=str(raw.get("contentType", "")).lower(),
            readable=bool(raw.get("readable")),
            matches_expected=bool(raw.get("matchesExpected")),
            confidence=float(raw.get("confidence", 0.0)),
            reason=str(raw.get("reason", "")),
        )

    def close(self) -> None:
        self._llm.close()