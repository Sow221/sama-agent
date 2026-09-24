"""
Tests du Journey Engine (règles pures ADR-006) — cas de la matrice C §53 (démo 2/3)
+ robustesse B §43–48. Aucun réseau : le moteur est DÉTERMINISTE.
"""
from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "services" / "worker"))
sys.path.insert(0, str(REPO_ROOT / "packages" / "shared" / "gen"))

from agent.domain import journey_engine
from agent.schemas import JourneyRequest, JourneyDocument
import enums


def _doc(req_id: str, status: str) -> JourneyDocument:
    return JourneyDocument(requirementId=req_id, status=status)


def _req(docs: list[JourneyDocument]) -> JourneyRequest:
    return JourneyRequest(journeyId="driving_license_new", documents=docs)


def test_demo_2_3_scenario() -> None:
    """B §39 : identité ✓ · médical ✓ · photos ! → NEEDS_DOCUMENT + PROVIDE_PHOTOS."""
    r = journey_engine.resolve(
        _req(
            [
                _doc("identity", enums.DocumentStatus.ANALYZED),
                _doc("medical", enums.DocumentStatus.ANALYZED),
                _doc("photos", enums.DocumentStatus.MISSING),
            ]
        )
    )
    assert r.status == enums.JourneyStatus.NEEDS_DOCUMENT
    assert r.completion.provided == 2
    assert r.completion.required == 3
    assert abs(r.completion.ratio - 2 / 3) < 1e-9
    assert r.nextAction == enums.NextAction.PROVIDE_PHOTOS
    assert r.nextActionRequirement == "photos"
    assert [s.id for s in r.steps] == ["understand", "prepare", "verify", "act"]
    assert r.steps[0].status == "done" and r.steps[1].status == "active"


def test_readt_for_next_step_when_complete() -> None:
    r = journey_engine.resolve(
        _req(
            [
                _doc("identity", enums.DocumentStatus.ANALYZED),
                _doc("medical", enums.DocumentStatus.ANALYZED),
                _doc("photos", enums.DocumentStatus.ANALYZED),
            ]
        )
    )
    assert r.status == enums.JourneyStatus.READY_FOR_NEXT_STEP
    assert r.completion.provided == 3
    assert r.nextAction == enums.NextAction.CONTACT_SERVICE


def test_needs_review_wins_over_document() -> None:
    """Un document suspect prend le dessus sur une fourniture manquante (jamais plus optimiste)."""
    r = journey_engine.resolve(
        _req(
            [
                _doc("identity", enums.DocumentStatus.ANALYZED),
                _doc("medical", enums.DocumentStatus.NEEDS_REVIEW),
                _doc("photos", enums.DocumentStatus.MISSING),
            ]
        )
    )
    assert r.status == enums.JourneyStatus.NEEDS_REVIEW
    assert r.nextAction == enums.NextAction.REVIEW_DOCUMENT


def test_unknown_documents_are_not_counted() -> None:
    """UNKNOWN/PROVIDED jamais comptés comme fournis ; l'exigence absente de la liste
    est rétablie MISSING par le moteur (état réel côté serveur) → NEEDS_DOCUMENT honnête."""
    r = journey_engine.resolve(
        _req(
            [
                _doc("identity", enums.DocumentStatus.PROVIDED),
                _doc("medical", enums.DocumentStatus.UNKNOWN),
            ]
        )
    )
    assert r.completion.provided == 0
    assert r.status == enums.JourneyStatus.NEEDS_DOCUMENT
    # photos (non fournie) réapparaît MISSING — jamais un état inventé.
    photos = next(d for d in r.documents if d.requirementId == "photos")
    assert photos.status == enums.DocumentStatus.MISSING


def test_in_progress_when_nothing_missing_and_nothing_analyzed() -> None:
    """Aucune exigence manquante mais rien d'analysé → IN_PROGRESS (pas de blocage)."""
    r = journey_engine.resolve(
        _req(
            [
                _doc("identity", enums.DocumentStatus.PROVIDED),
                _doc("medical", enums.DocumentStatus.PROVIDED),
                _doc("photos", enums.DocumentStatus.PROVIDED),
            ]
        )
    )
    assert r.completion.provided == 0
    assert r.status == enums.JourneyStatus.IN_PROGRESS


def test_pure_and_stable() -> None:
    """Même entrée → même sortie (aucun aléa)."""
    a = journey_engine.resolve(_req([_doc("identity", enums.DocumentStatus.ANALYZED)]))
    b = journey_engine.resolve(_req([_doc("identity", enums.DocumentStatus.ANALYZED)]))
    assert a.model_dump() == b.model_dump()