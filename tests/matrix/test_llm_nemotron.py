"""Nemotron : pas de « réflexion à voix haute » dans la réponse lue à l'usager."""
from __future__ import annotations

from types import SimpleNamespace

from agent.infrastructure.llm.glm import GlmLlm


class _Http:
    def __init__(self, responses):
        self.responses = list(responses)
        self.payloads: list[dict] = []

    def post(self, url, headers=None, json=None):
        self.payloads.append(dict(json))
        status, content = self.responses.pop(0)
        return SimpleNamespace(
            status_code=status,
            request=None,
            json=lambda: {"choices": [{"message": {"content": content}}]},
            raise_for_status=lambda: None,
        )


def _llm(model, http, monkeypatch):
    monkeypatch.setenv("NVIDIA_BASE_URL", "https://nim.test/v1")
    monkeypatch.setenv("NVIDIA_API_KEY", "k")
    llm = GlmLlm(model=model, force_json=False)
    llm._httpx = http
    return llm


def test_nemotron_thinking_is_disabled_and_think_block_stripped(monkeypatch) -> None:
    http = _Http([(200, "We need to answer…</think>FR: Bonjour.\nWO: Salaam.")])
    out = _llm("nvidia/nemotron-3-super-120b-a12b", http, monkeypatch).chat_text(
        [{"role": "user", "content": "x"}])
    assert out == "FR: Bonjour.\nWO: Salaam."
    assert http.payloads[0]["chat_template_kwargs"] == {"enable_thinking": False}


def test_option_refused_is_retried_without_it(monkeypatch) -> None:
    http = _Http([(400, ""), (200, "Bonjour.")])
    out = _llm("nvidia/nemotron-x", http, monkeypatch).chat_text([{"role": "user", "content": "x"}])
    assert out == "Bonjour."
    assert "chat_template_kwargs" not in http.payloads[1]


def test_other_models_do_not_get_the_option(monkeypatch) -> None:
    http = _Http([(200, "ok")])
    _llm("z-ai/glm-5.3", http, monkeypatch).chat_text([{"role": "user", "content": "x"}])
    assert "chat_template_kwargs" not in http.payloads[0]
