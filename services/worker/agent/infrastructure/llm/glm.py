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

    def chat_with_tools(
        self, user_content: str, tools: list[dict], system: str | None = None
    ) -> tuple[dict | None, list[dict] | None]:
        """Tool calling (référence §5.4) : le modèle peut DEMANDER un outil, il ne l'exécute pas.

        Retourne (contenu message, tool_calls bruts venant du modèle). Le dispatcher
        exécute ensuite réellement (frontière LLM ↔ système). Un appel d'outil ne passe
        JAMAIS par response_format json_object (réservé aux sorties JSON pures).
        """
        if not self.base_url or not self.api_key:
            raise LlmUnavailableError("NVIDIA_BASE_URL / NVIDIA_API_KEY manquants")
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": user_content})
        r = self._httpx.post(
            f"{self.base_url}/chat/completions",
            headers={"Authorization": f"Bearer {self.api_key}"},
            json={
                "model": self.model,
                "messages": messages,
                "temperature": 0,
                "tools": list(tools),
                "tool_choice": "auto",
            },
        )
        r.raise_for_status()
        message = r.json()["choices"][0]["message"]
        return message.get("content") or None, message.get("tool_calls") or None

    def close(self) -> None:
        self._httpx.close()