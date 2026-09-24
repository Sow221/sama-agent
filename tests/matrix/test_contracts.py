"""
Contrats partagés (plan point 14) : packages/shared/contracts/*.json est LA source
commune entre TS (Zod) et Python (Pydantic). Chaque fixture est validée des deux côtés ;
un changement de contrat doit casser un test AVANT la production.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from agent.schemas import JourneyRequest, JourneyResponse

REPO_ROOT = Path(__file__).resolve().parents[2]
CONTRACTS = REPO_ROOT / "packages" / "shared" / "contracts"


def _load(name: str) -> dict:
    return json.loads((CONTRACTS / name).read_text("utf-8"))


def test_valid_journey_response_parses() -> None:
    """Le payload de référence (démo 2/3) est accepté tel quel par Pydantic."""
    resp = JourneyResponse.model_validate(_load("journey-response-valid.json"))
    assert resp.nextAction == "PROVIDE_PHOTOS"
    assert resp.nextActionLabel == "Fournir les photographies"
    assert resp.nextActionReason
    assert resp.completion.ratio == pytest.approx(2 / 3)


def test_invalid_document_status_rejected() -> None:
    """Point 8 : un statut 'VALIDATED_BY_AI' (certification IA) est rejeté au contrat."""
    with pytest.raises(ValidationError):
        JourneyRequest.model_validate(_load("journey-request-invalid-status.json"))


def test_completion_in_request_rejected() -> None:
    """G3 (point 5) : la completion n'est JAMAIS une entrée — le contrat strict la rejette."""
    with pytest.raises(ValidationError):
        JourneyRequest.model_validate(_load("journey-request-with-completion.json"))