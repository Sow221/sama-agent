"""
Tools & Tool Dispatcher (référence §5.4) — la frontière LLM ↔ système.

Règle centrale testée : le dispatcher EXÉCUTE réellement via le système (use cases +
domaine déterministe) ; une erreur métier = statut `failed` lisible, jamais une
invention. Le mode déterministic n'appelle aucun modèle (analyze_document → NEEDS_REVIEW).
"""
from __future__ import annotations

import base64
import os

os.environ.setdefault("SAMA_MODE", "deterministic")  # avant tout import agent (mode tamponné)

import pytest

from agent.tools import GLM_TOOLS, dispatcher, execute_tool
from agent.tools.dispatcher import UnknownToolError
import enums

TOOL_NAMES = {"get_procedure", "get_journey_state", "get_missing_requirements",
              "get_next_action", "analyze_document", "get_evidence"}


def test_definitions_contract_has_six_tools() -> None:
    """Le catalogue présenté à GLM couvre exactement les outils de la référence §5.4."""
    names = {t["function"]["name"] for t in GLM_TOOLS}
    assert names == TOOL_NAMES


def test_definitions_use_enum_source_unique() -> None:
    """Statuts des outils dérivés de enums.json (parité TS ≡ Python ≡ JSON), jamais dupliqués."""
    docs_tool = next(t for t in GLM_TOOLS if t["function"]["name"] == "get_journey_state")
    enum_values = docs_tool["function"]["parameters"]["properties"]["documents"]["items"]["properties"]["status"]["enum"]
    assert enum_values == [e.value for e in enums.DocumentStatus]
    assert "VALIDATED_BY_AI" not in enum_values  # jamais de sous-entendu de validation


def test_get_journey_state_deterministic() -> None:
    """get_journey_state : état réel calculé par le moteur (3 documents → NEEDS_DOCUMENT)."""
    result = execute_tool("get_journey_state", {"journey_id": "driving_license_new"})
    assert result["status"] == "success"
    assert result["result"]["journeyId"] == "driving_license_new"
    assert result["result"]["status"] == enums.JourneyStatus.NEEDS_DOCUMENT
    assert len(result["result"]["documents"]) == 3
    assert all(d["status"] == enums.DocumentStatus.MISSING for d in result["result"]["documents"])


def test_get_next_action_derived_never_invented() -> None:
    """Prochaine action = décision du moteur ; label + raison viennent des enums (labels serveur)."""
    result = execute_tool("get_next_action", {"journey_id": "driving_license_new"})
    payload = result["result"]
    assert payload["nextAction"] == enums.NextAction.PROVIDE_DOCUMENT
    assert payload["nextActionLabel"]  # jamais reconstruit côté front
    assert payload["nextActionReason"]


def test_get_missing_requirements_count() -> None:
    result = execute_tool("get_missing_requirements", {"journey_id": "driving_license_new"})
    payload = result["result"]
    assert payload["count"] == 3
    assert {m["requirementId"] for m in payload["missing"]} == {"identity", "medical", "photos"}


def test_journey_state_accepts_known_documents() -> None:
    """Les documents connus sont pris en compte : identité+photos analysées → IN_PROGRESS (pas MISSING)."""
    docs = [
        {"requirement_id": "identity", "status": "ANALYZED"},
        {"requirement_id": "medical", "status": "PROVIDED"},
        {"requirement_id": "photos", "status": "ANALYZED"},
    ]
    result = execute_tool("get_journey_state", {"journey_id": "driving_license_new", "documents": docs})
    payload = result["result"]
    assert payload["status"] == enums.JourneyStatus.IN_PROGRESS
    assert all(d["status"] != enums.DocumentStatus.MISSING for d in payload["documents"])


def test_journey_state_rejects_invalid_status() -> None:
    """Un statut hors enum → échec lisible (jamais de statut inventé rentré dans le moteur)."""
    docs = [{"requirement_id": "identity", "status": "VALIDATED_BY_AI"}]
    result = execute_tool("get_journey_state", {"journey_id": "driving_license_new", "documents": docs})
    assert result["status"] == "failed"
    assert "statut de document invalide" in result["error"]


def test_get_procedure_success_and_unknown() -> None:
    """Procédure connue → exigences/étapes réelles ; inconnue → failed (jamais 500 ni invention)."""
    ok = execute_tool("get_procedure", {"procedure_id": "driving_license_new"})
    assert ok["status"] == "success"
    assert {r["id"] for r in ok["result"]["required"]} == {"identity", "medical", "photos"}

    ko = execute_tool("get_procedure", {"procedure_id": "procedure_inexistante"})
    assert ko["status"] == "failed"
    assert "procédure inconnue" in ko["error"]


def test_get_evidence_success_and_unknown() -> None:
    ok = execute_tool("get_evidence", {"requirement": "identity"})
    assert ok["status"] == "success"
    assert ok["result"]["source"]  # origine enregistrée, jamais improvisée

    ko = execute_tool("get_evidence", {"requirement": "requirement_inexistant"})
    assert ko["status"] == "failed"
    assert "aucune preuve" in ko["error"]


def test_analyze_document_non_image_is_honest_needs_review() -> None:
    """Hors vision (mode deterministic / format non-image) → NEEDS_REVIEW honnête, jamais « validé »."""
    blob = base64.b64encode(b"pas une image du tout").decode()
    result = execute_tool(
        "analyze_document",
        {
            "requirement_id": "identity",
            "journey_id": "driving_license_new",
            "file_name": "notes.txt",
            "content_type": "text/plain",
            "file_base64": blob,
        },
    )
    assert result["status"] == "success"
    assert result["result"]["status"] == enums.DocumentStatus.NEEDS_REVIEW
    assert result["result"]["requiresHumanReview"] is True


def test_analyze_document_requires_file() -> None:
    result = execute_tool("analyze_document", {"requirement_id": "identity"})
    assert result["status"] == "failed"
    assert "file_base64 requis" in result["error"]


def test_unknown_tool_raises() -> None:
    with pytest.raises(UnknownToolError):
        execute_tool("envoyer_un_email", {})


def test_every_call_is_traced() -> None:
    """Chaque appel est tracé (tool_calls : nom, arguments, statut, latence) — référence §7.3."""
    before = len(dispatcher.traces)
    execute_tool("get_next_action", {"journey_id": "driving_license_new"})
    trace = dispatcher.traces[-1]
    assert len(dispatcher.traces) == before + 1
    assert trace.tool_name == "get_next_action"
    assert trace.status == "success"
    assert trace.latency_ms >= 0
    assert trace.arguments == {"journey_id": "driving_license_new"}

def test_live_tools_read_the_database_not_model_supplied_statuses(monkeypatch) -> None:
    """Live : un modèle qui « déclare » des pièces ANALYZED ne rend pas le dossier prêt."""
    import uuid

    from agent import mode as app_mode
    from agent.application.use_cases.persist_journey import apply_journey
    from agent.schemas import JourneyRequest

    jid = f"tool_{uuid.uuid4().hex[:10]}"
    apply_journey(JourneyRequest(journeyId=jid, procedureId="driving_license_new"))
    monkeypatch.setattr(app_mode, "is_live", lambda: True)
    forged = [{"requirement_id": r, "status": "ANALYZED"} for r in ("identity", "medical", "photos")]
    result = execute_tool("get_journey_state", {"journey_id": jid, "documents": forged})
    assert result["status"] == "success"
    assert result["result"]["status"] == enums.JourneyStatus.NEEDS_DOCUMENT
    assert result["result"]["completion"]["provided"] == 0
