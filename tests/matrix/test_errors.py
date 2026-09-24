"""
Contrats d'erreur (plan point 26, cas A–G) — l'API RÉELLE (agent.api.fastapi) est testée,
pas un mock : les statuts HTTP et messages sont le comportement de production.
Cas H/I/J (ASR/LLM/TTS indisponibles) : jour J GPU Brev uniquement.
"""
from __future__ import annotations

import os

os.environ.setdefault("SAMA_MODE", "deterministic")  # avant import de agent.api.fastapi

# Import du vrai app — l'accroche contextuelle (conftest) ajoute services/worker + packages/shared/gen.
from fastapi.testclient import TestClient
from agent.api.fastapi import app

client = TestClient(app)


def test_A_unknown_procedure_is_404() -> None:
    """Procédure inexistante → 404 métier (jamais 500)."""
    r = client.post("/api/journey", json={"journeyId": "procedure_inconnue"})
    assert r.status_code == 404, r.text
    assert "procédure inconnue" in r.json()["detail"]


def test_B_empty_transcript_rejected() -> None:
    """Transcript vide rejeté au contrat (min_length=1)."""
    r = client.post("/api/intent", json={"transcript": ""})
    assert r.status_code == 422
    assert "transcript" in r.text


def test_C_invalid_document_status_rejected() -> None:
    """Point 8 : jamais de statut 'validé par l'IA' — le contrat le rejette (422)."""
    r = client.post(
        "/api/journey",
        json={
            "journeyId": "driving_license_new",
            "documents": [{"requirementId": "identity", "status": "VALIDATED_BY_AI"}],
        },
    )
    assert r.status_code == 422
    assert "VALIDATED_BY_AI" in r.text


def test_D_completion_as_input_rejected() -> None:
    """G3 : la completion n'est JAMAIS une entrée — champion interdit (422)."""
    r = client.post(
        "/api/journey",
        json={
            "journeyId": "driving_license_new",
            "documents": [{"requirementId": "identity", "status": "MISSING"}],
            "completion": {"provided": 1, "required": 3, "ratio": 0.33},
        },
    )
    assert r.status_code == 422


def test_E_unknown_evidence_is_404() -> None:
    """Preuve inconnue → 404."""
    r = client.get("/api/evidence/requirement_inexistant")
    assert r.status_code == 404
    assert "preuve introuvable" in r.json()["detail"]


def test_F_analyze_without_file_rejected() -> None:
    """Analyse sans fichier → 422 (UploadFile obligatoire)."""
    r = client.post("/api/documents/analyze", data={"requirementId": "identity", "journeyId": "driving_license_new"})
    assert r.status_code == 422


def test_G_other_format_is_honest_needs_review() -> None:
    """Un fichier pas en image → 200, statut honnête NEEDS_REVIEW (jamais fabriqué)."""
    r = client.post(
        "/api/documents/analyze",
        data={"requirementId": "identity", "journeyId": "driving_license_new"},
        files={"file": ("notes.txt", b"pas une image", "text/plain")},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "NEEDS_REVIEW"
    assert body["requiresHumanReview"] is True


def test_trace_header_present_on_success_and_error() -> None:
    """Observabilité (point 16) : x-request-id présent y compris sur 404/422."""
    ok = client.post("/api/intent", json={"transcript": "permis"})
    err = client.post("/api/journey", json={"journeyId": "nope"})
    assert ok.headers.get("x-request-id")
    assert err.headers.get("x-request-id")