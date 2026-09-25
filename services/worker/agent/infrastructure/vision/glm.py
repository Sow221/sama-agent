"""Vision provider (infrastructure) — observation réelle d'un document, en 2 temps.

Chaîne RÉELLE (deux appels NVIDIA, jamais de simulation) :
  1. un modèle VISION décrit factuellement le document (llama-3.2-vision NIM :
     il ne contraint pas le JSON, il décrit — prouvé par la batterie e2e) ;
  2. un modèle TEXTE (extracteur JSON) structure la description dans le contrat
     de la guidance (document/v1 → extract/v1).

Le provider OBSERVE (contenu, lisibilité, correspondance) ; il ne classe pas :
la classification (statuts, ANALYZED ≠ VALIDATED) vit dans le domaine (document.py).
Les deux modèles sont pilotables par env : NVIDIA_VISION_MODEL (description) et
NVIDIA_EXTRACT_MODEL (structuration JSON).
"""
from __future__ import annotations

import base64
import os

from agent.infrastructure.llm.glm import GlmLlm
from agent.infrastructure.prompts import load_prompt
from agent.domain.document import DocumentObservation

VISION_MODEL_DEFAULT = "meta/llama-3.2-11b-vision-instruct"
EXTRACT_MODEL_DEFAULT = "z-ai/glm-5.3-flash"


class GlmVisionProvider:
    def __init__(self) -> None:
        # Descripteur visuel : pas de response_format (les NIM vision l'ignorent).
        self._vision = GlmLlm(
            model=os.getenv("NVIDIA_VISION_MODEL", VISION_MODEL_DEFAULT),
            force_json=False,
        )
        # Extracteur structuré : JSON contraint, modèle texte léger séparé du
        # moteur d'intention pour rester réactif à la démo.
        self._extractor = GlmLlm(
            model=os.getenv("NVIDIA_EXTRACT_MODEL", EXTRACT_MODEL_DEFAULT),
            force_json=True,
        )

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
        # 1) description factuelle par la vision (texte brut du modèle).
        description = self._vision.chat_text_multimodal(prompt, [payload])
        # 2) structuration JSON contrainte par l'extracteur texte.
        extract_prompt = load_prompt("extract", "v1") + "\n\nDESCRIPTION :\n" + description
        raw = self._extractor.chat_json(extract_prompt)
        return DocumentObservation(
            content_type=str(raw.get("contentType", "")).lower(),
            readable=bool(raw.get("readable")),
            matches_expected=bool(raw.get("matchesExpected")),
            confidence=float(raw.get("confidence", 0.0)),
            reason=str(raw.get("reason", "")),
        )

    def close(self) -> None:
        self._vision.close()
        self._extractor.close()