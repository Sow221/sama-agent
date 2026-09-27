"""LLM provider (infrastructure) — GLM via endpoint HTTP compatible OpenAI (NIM).

Le provider ne décide RIEN : il transpose un prompt en JSON. La validation du contrat
et la politique (fallback honnête) vivent dans l'application / le domaine.

Robustesse NIM (mission clôture) :
  · retry borné sur erreurs transport/5xx (jamais sur 4xx : erreur de requête),
  · circuit breaker partagé : N échecs consécutifs → refus rapide honnête (503)
    pendant un intervalle, puis demi-ouverture (probe) — on ne martèle pas un NIM down,
  · statut fournisseur observable : `provider_status()` (dernière latence, erreur,
    état du disjoncteur, warm/cold) exposé par `GET /api/ai/status`.
"""
from __future__ import annotations

import json
import logging
import os
import threading
import time

import httpx

log = logging.getLogger("sama.llm")

_MAX_RETRIES = int(os.getenv("LLM_MAX_RETRIES", "1"))          # 1 nouvelle tentative max
_RETRY_BACKOFF_S = float(os.getenv("LLM_RETRY_BACKOFF_S", "0.8"))
_CIRCUIT_FAIL_THRESHOLD = float(os.getenv("LLM_CIRCUIT_FAIL_RATIO", "0.5"))
_CIRCUIT_WINDOW = int(os.getenv("LLM_CIRCUIT_WINDOW", "10"))    # analyse des 10 derniers
_CIRCUIT_OPEN_S = float(os.getenv("LLM_CIRCUIT_OPEN_S", "30.0"))


class LlmUnavailableError(RuntimeError):
    """Endpoint / clé absents ou réponse inutilisable — le fallback honnête décide."""


class _CircuitBreaker:
    """Disjoncteur partagé entre toutes les instances GlmLlm (un état par process).

    Windows : le worker tourne plusieurs GlmLlm par requête — le breaker doit
    être processuel, pas par instance, sinon il ne protège rien.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._results: list[bool] = []           # True=ok, False=échec
        self._open_until = 0.0                   # horloge monotone
        self._failures = 0

    def allow(self) -> bool:
        """False → circuit ouvert : on refuse l'appel sans toucher le fournisseur."""
        with self._lock:
            if self._open_until and time.monotonic() < self._open_until:
                return False
            return True

    def record(self, ok: bool) -> None:
        with self._lock:
            self._results.append(ok)
            if not ok:
                self._failures += 1
            if len(self._results) > _CIRCUIT_WINDOW:
                dropped = self._results.pop(0)
                if not dropped:
                    self._failures -= 1
            ratio = self._failures / max(len(self._results), 1)
            if not ok and len(self._results) >= min(_CIRCUIT_WINDOW, 3) and ratio >= _CIRCUIT_FAIL_THRESHOLD:
                self._open_until = time.monotonic() + _CIRCUIT_OPEN_S
                log.warning("circuit breaker OUVERT %ss — %d/%d échecs NIM",
                            _CIRCUIT_OPEN_S, self._failures, len(self._results))

    def state(self) -> dict:
        with self._lock:
            return {
                "open": bool(self._open_until) and time.monotonic() < self._open_until,
                "openForSecs": round(max(self._open_until - time.monotonic(), 0.0), 1),
                "window": len(self._results),
                "failures": self._failures,
                "failRatio": round(self._failures / max(len(self._results), 1), 3),
            }


_circuit = _CircuitBreaker()

# État fournisseur observable (dernier appel) — jamais de secret.
_status: dict = {"state": "idle", "lastLatencyMs": None, "lastError": None}
_status_lock = threading.Lock()


def provider_status() -> dict:
    with _status_lock:
        return {
            "model": os.getenv("NVIDIA_MODEL", "z-ai/glm-5.3"),
            "configured": bool(os.getenv("NVIDIA_BASE_URL") and os.getenv("NVIDIA_API_KEY")),
            "circuit": _circuit.state(),
            **dict(_status),
        }


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

    def _chat(self, messages: list[dict], force_json: bool | None = None,
              max_tokens: int | None = None) -> str:
        """Un aller-retour réel vers le NIM — renvoie le texte brut du modèle.

        NON-streaming (choix mesuré, pas un préjugé) : sur ce backend NVIDIA, le
        streaming pour les sorties json_object volumineuses est 4× plus lent que la
        requête synchrone — mesuré 183 469 ms en streaming contre 35–49 s à chaud en
        non-streaming. Le NIM bufférise la génération. On garde donc le mode
        synchrone, et l'on transforme proprement les erreurs transport (ex. 504
        NVIDIA) en LlmUnavailableError — jamais de contenu fabriqué.
        """
        if not self.base_url or not self.api_key:
            raise LlmUnavailableError("NVIDIA_BASE_URL / NVIDIA_API_KEY manquants")
        payload: dict = {
            "model": self.model,
            "messages": messages,
            "temperature": 0,
        }
        if max_tokens:
            payload["max_tokens"] = max_tokens
        if self._force_json if force_json is None else force_json:
            payload["response_format"] = {"type": "json_object"}
        if not _circuit.allow():
            error = "NIM hors service (circuit ouvert) — réessayez dans un instant"
            with _status_lock:
                _status.update({"state": "circuit_open", "lastError": error})
            raise LlmUnavailableError(error)

        attempts = 1 + _MAX_RETRIES
        last_exc: Exception | None = None
        for attempt in range(1, attempts + 1):
            started = time.perf_counter()
            try:
                r = self._httpx.post(
                    f"{self.base_url}/chat/completions",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    json=payload,
                )
                if r.status_code >= 500 or r.status_code == 429:
                    # 5xx / 429 : fournisseur saturé ou en panne — nouvel essai borné.
                    raise httpx.HTTPStatusError(
                        f"NIM status {r.status_code}", request=r.request, response=r
                    )
                r.raise_for_status()
                content = r.json()["choices"][0]["message"]["content"]
                if not content:
                    raise LlmUnavailableError("réponse vide du modèle")
                latency_ms = round((time.perf_counter() - started) * 1000, 1)
                _circuit.record(True)
                with _status_lock:
                    _status.update({"state": "ok", "lastLatencyMs": latency_ms, "lastError": None})
                return content
            except LlmUnavailableError:
                _circuit.record(False)
                raise
            except httpx.HTTPError as exc:
                last_exc = exc
                _circuit.record(False)
                with _status_lock:
                    _status.update({
                        "state": "error",
                        "lastLatencyMs": round((time.perf_counter() - started) * 1000, 1),
                        "lastError": str(exc)[:300],
                    })
                if attempt < attempts:
                    log.warning("NIM tentative %d/%d en échec (%s) — nouvel essai dans %.1fs",
                                attempt, attempts, exc, _RETRY_BACKOFF_S)
                    time.sleep(_RETRY_BACKOFF_S)
        # Décision honnête au-dessus : clarification ou 503, jamais de contenu fabriqué.
        raise LlmUnavailableError(f"NIM indisponible : {last_exc}") from last_exc

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

    def chat_text(self, messages: list[dict], max_tokens: int = 700) -> str:
        """Conversation libre (texte, sans contrainte JSON) : le chat de l'usager."""
        # Borne la longueur : une réponse de chat se lit (ou se dit) en quelques
        # secondes ; sans borne, le modèle peut générer longtemps (15 s mesurées).
        return self._chat(messages, force_json=False, max_tokens=max_tokens)

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

    def warm(self) -> None:
        """Préchauffage NIM contrôlé : une inference minimale, idempotente.

        Appelé automatiquement au démarrage du worker (SAMA_AUTO_WARMUP) pour
        éviter le cold start (latence à froid mesurée jusqu'à ~300 s). Ne remplace
        JAMAIS une réponse : il ne sert qu'à réchauffer. Les erreurs sont loggées
        et n'entraînent aucun échec du worker.
        """
        if not self.base_url or not self.api_key:
            return
        try:
            started = time.perf_counter()
            r = self._httpx.post(
                f"{self.base_url}/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json={
                    "model": self.model,
                    "messages": [{"role": "user", "content": "Réponds exactement par OK."}],
                    "temperature": 0,
                    "max_tokens": 8,
                },
                timeout=float(os.getenv("LLM_WARMUP_TIMEOUT_SECS", "600")),
            )
            r.raise_for_status()
            duration = round(time.perf_counter() - started, 1)
            with _status_lock:
                _status.update({"state": "warm", "lastLatencyMs": None,
                                "lastError": None, "warmupMs": round(duration * 1000, 1)})
            log.info("NIM préchauffé en %.1fs", duration)
        except Exception as exc:  # jamais fatal au worker
            log.warning("préchauffage NIM en échec (ignoré) : %s", exc)

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