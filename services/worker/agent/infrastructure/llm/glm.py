"""LLM provider (infrastructure) — GLM via endpoint HTTP compatible OpenAI (NIM).

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
    def __init__(self, model: str | None = None, force_json: bool = True) -> None:
        self.base_url = os.getenv("NVIDIA_BASE_URL", "").rstrip("/")
        self.api_key = os.getenv("NVIDIA_API_KEY", "")
        self.model = model or os.getenv("NVIDIA_MODEL", "z-ai/glm-5.3")
        # Certains NIM (vision) n'acceptent pas response_format json_object :
        # il est pilotable par instance (voir GlmVisionProvider).
        self._force_json = force_json
        # Le NIM NVIDIA peut démarrer froid (première inférence lente,
        # mesuré jusqu'à ~300 s sur GLM) : timeout très généreux et
        # configurable, sinon on fabriquerait une panne à la démo.
        timeout_s = float(os.getenv("LLM_TIMEOUT_SECS", "600"))
        self._httpx = httpx.Client(timeout=timeout_s)

    def _chat(self, messages: list[dict]) -> str:
        """Un aller-retour réel vers le NIM — renvoie le texte brut du modèle."""
        if not self.base_url or not self.api_key:
            raise LlmUnavailableError("NVIDIA_BASE_URL / NVIDIA_API_KEY manquants")
        payload: dict = {
            "model": self.model,
            "messages": messages,
            "temperature": 0,
        }
        if self._force_json:
            payload["response_format"] = {"type": "json_object"}
        r = self._httpx.post(
            f"{self.base_url}/chat/completions",
            headers={"Authorization": f"Bearer {self.api_key}"},
            json=payload,
        )
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"]

    def _request(self, messages: list[dict]) -> dict:
        return self._parse_json(self._chat(messages))

    @staticmethod
    def _parse_json(content: str) -> dict:
        """Parse la sortie JSON du modèle, tolérant aux artefacts (fences markdown, prose).

        Les modèles vision peuvent encadrer leur JSON (```json … ```) ou y ajouter
        du texte : on ne casse jamais la chaîne pour un détail de format — mais on
        refuse (LlmUnavailableError → fallback honnête) si aucun JSON n'est extractible.
        """
        text = content.strip()
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass
        import re

        fenced = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.DOTALL)
        if fenced:
            try:
                return json.loads(fenced.group(1))
            except json.JSONDecodeError:
                pass
        start, end = text.find("{"), text.rfind("}")
        if start != -1 and end > start:
            try:
                return json.loads(text[start : end + 1])
            except json.JSONDecodeError:
                pass
        raise LlmUnavailableError(f"réponse non-JSON du modèle : {content[:200]!r}")

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

    def chat_text_multimodal(
        self, prompt: str, content_parts: list[dict], system: str | None = None
    ) -> str:
        """Question multimodale SANS contrainte JSON — renvoie le texte brut.

        Chaîne vision actuelle : le modèle descriptif (llama vision NIM) ne honore
        pas response_format → on récupère sa DESCRIPTION, puis un second appel texte
        (extracteur JSON) la structure. Deux appels réels, aucune fabrication.
        """
        messages: list[dict] = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append(
            {"role": "user", "content": [{"type": "text", "text": prompt}, *content_parts]}
        )
        return self._chat(messages)

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