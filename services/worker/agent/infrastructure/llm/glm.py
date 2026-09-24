"""LLM provider (infrastructure) — GLM-5.3-Flash via endpoint HTTP compatible OpenAI (NIM).

Le provider ne décide RIEN : il transpose un prompt en JSON. La validation du contrat
et la politique (fallback honnête) vivent dans l'application / le domaine.
"""
from __future__ import annotations

import json
import os

import httpx


class LlmUnavailableError(RuntimeError):
    """Endpoint / clé absents ou réponse inutilisable — le fallback honnête décide."""


class GlmLlm:
    def __init__(self) -> None:
        self.base_url = os.getenv("NVIDIA_BASE_URL", "").rstrip("/")
        self.api_key = os.getenv("NVIDIA_API_KEY", "")
        self.model = os.getenv("NVIDIA_MODEL", "glm-5.3-flash")
        self._httpx = httpx.Client(timeout=60)

    def _request(self, messages: list[dict]) -> dict:
        if not self.base_url or not self.api_key:
            raise LlmUnavailableError("NVIDIA_BASE_URL / NVIDIA_API_KEY manquants")
        r = self._httpx.post(
            f"{self.base_url}/chat/completions",
            headers={"Authorization": f"Bearer {self.api_key}"},
            json={
                "model": self.model,
                "messages": messages,
                "temperature": 0,
                "response_format": {"type": "json_object"},
            },
        )
        r.raise_for_status()
        content = r.json()["choices"][0]["message"]["content"]
        return json.loads(content)

    def chat_json(self, prompt: str, system: str | None = None) -> dict:
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        return self._request(messages)

    def chat_json_multimodal(self, prompt: str, content_parts: list[dict], system: str | None = None) -> dict:
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append(
            {"role": "user", "content": [{"type": "text", "text": prompt}, *content_parts]}
        )
        return self._request(messages)

    def close(self) -> None:
        self._httpx.close()