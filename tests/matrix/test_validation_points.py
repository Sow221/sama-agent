"""
Validation du Journey Engine — plan équipe 24/09 (points 5, 6, 11, 12).
Matrice exhaustive : compteur 0/3→3/3, états de documents, priorité explicite,
prochaine action avec label + raison dérivés du moteur (source unique enums.json).
"""
from __future__ import annotations

import pytest

from agent.domain import journey_engine
from agent.schemas import JourneyDocument, JourneyRequest
import enums

REQ_ID = ("identity", "medical", "photos")


def _req(docs: list[JourneyDocument]) -> JourneyRequest:
    return JourneyRequest(journeyId="driving_license_new", documents=docs)


def _doc(req_id: str, status: enums.DocumentStatus) -> JourneyDocument:
    return JourneyDocument(requirementId=req_id, status=status)


def _all(*statuses: enums.DocumentStatus) -> list[JourneyDocument]:
    return [_doc(r, s) for r, s in zip(REQ_ID, statuses)]


# ── Point 5 : compteur 0/3 → 3/3 (toujours dérivé, jamais en dur) ─────────────
@pytest.mark.parametrize(
    ("analyzed", "expected_status"),
    [
        (0, enums.JourneyStatus.NEEDS_DOCUMENT),
        (1, enums.JourneyStatus.NEEDS_DOCUMENT),
        (2, enums.JourneyStatus.NEEDS_DOCUMENT),
        (3, enums.JourneyStatus.READY_FOR_NEXT_STEP),
    ],
)
def test_counter_derived_0_1_2_3(analyzed: int, expected_status) -> None:
    docs = []
    for i, req_id in enumerate(REQ_ID):
        status = (
            enums.DocumentStatus.ANALYZED
            if i < analyzed
            else enums.DocumentStatus.MISSING
        )
        docs.append(_doc(req_id, status))
    r = journey_engine.resolve(_req(docs))
    assert r.completion.provided == analyzed
    assert r.completion.required == 3
    assert abs(r.completion.ratio - analyzed / 3) < 1e-9
    assert r.status == expected_status


# ── Point 6 : chaque état de document → statut + prochaine action cohérents ───
def test_document_state_matrix() -> None:
    cases = [
        # (identité, médical, photos) → statut parcours, nextAction, nb fournis
        ((enums.DocumentStatus.ANALYZED, enums.DocumentStatus.ANALYZED, enums.DocumentStatus.MISSING),
         enums.JourneyStatus.NEEDS_DOCUMENT, enums.NextAction.PROVIDE_PHOTOS, 2),
        ((enums.DocumentStatus.MISSING, enums.DocumentStatus.ANALYZED, enums.DocumentStatus.ANALYZED),
         enums.JourneyStatus.NEEDS_DOCUMENT, enums.NextAction.PROVIDE_DOCUMENT, 2),
        ((enums.DocumentStatus.ANALYZED, enums.DocumentStatus.NEEDS_REVIEW, enums.DocumentStatus.ANALYZED),
         enums.JourneyStatus.NEEDS_REVIEW, enums.NextAction.REVIEW_DOCUMENT, 2),
        ((enums.DocumentStatus.ANALYZED, enums.DocumentStatus.UNEXPECTED, enums.DocumentStatus.ANALYZED),
         enums.JourneyStatus.NEEDS_REVIEW, enums.NextAction.REVIEW_DOCUMENT, 2),
        ((enums.DocumentStatus.ANALYZED, enums.DocumentStatus.ANALYZED, enums.DocumentStatus.ANALYZED),
         enums.JourneyStatus.READY_FOR_NEXT_STEP, enums.NextAction.CONTACT_SERVICE, 3),
        ((enums.DocumentStatus.PROVIDED, enums.DocumentStatus.PROVIDED, enums.DocumentStatus.PROVIDED),
         enums.JourneyStatus.IN_PROGRESS, enums.NextAction.READ_INFORMATION, 0),
        ((enums.DocumentStatus.UNKNOWN, enums.DocumentStatus.UNKNOWN, enums.DocumentStatus.UNKNOWN),
         enums.JourneyStatus.IN_PROGRESS, enums.NextAction.READ_INFORMATION, 0),
    ]
    for (id_s, med_s, ph_s), status, action, provided in cases:
        r = journey_engine.resolve(_req(_all(id_s, med_s, ph_s)))
        assert r.status == status, (id_s, med_s, ph_s)
        assert r.nextAction == action
        assert r.completion.provided == provided


# ── Point 11 : priorité explicite (jamais plus optimiste que la vérité) ───────
def test_suspect_document_wins_over_missing() -> None:
    """NEEDS_REVIEW (priorité 1) prime sur une exigence manquante (priorité 2)."""
    r = journey_engine.resolve(
        _req(
            [
                _doc("identity", enums.DocumentStatus.NEEDS_REVIEW),
                _doc("medical", enums.DocumentStatus.ANALYZED),
                _doc("photos", enums.DocumentStatus.MISSING),
            ]
        )
    )
    assert r.status == enums.JourneyStatus.NEEDS_REVIEW
    assert r.nextAction == enums.NextAction.REVIEW_DOCUMENT
    assert r.nextActionRequirement == "identity"


# ── Point 12 : NextAction unique, compréhensible, liée à l'état, justifiée ────
def test_next_action_label_and_reason_derived() -> None:
    """label + raison viennent du moteur (enums.json) — le front ne reconstruit rien."""
    cases = [
        # (docs, nextAction attendue, label attendu)
        ([_doc("photos", enums.DocumentStatus.MISSING),
          _doc("identity", enums.DocumentStatus.ANALYZED),
          _doc("medical", enums.DocumentStatus.ANALYZED)],
         enums.NextAction.PROVIDE_PHOTOS, "Fournir les photographies"),
        ([_doc("identity", enums.DocumentStatus.MISSING),
          _doc("medical", enums.DocumentStatus.ANALYZED),
          _doc("photos", enums.DocumentStatus.ANALYZED)],
         enums.NextAction.PROVIDE_DOCUMENT, "Fournir un document"),
        ([_doc("medical", enums.DocumentStatus.NEEDS_REVIEW),
          _doc("identity", enums.DocumentStatus.ANALYZED),
          _doc("photos", enums.DocumentStatus.ANALYZED)],
         enums.NextAction.REVIEW_DOCUMENT, "Vérifier un document"),
        ([_doc("identity", enums.DocumentStatus.ANALYZED),
          _doc("medical", enums.DocumentStatus.ANALYZED),
          _doc("photos", enums.DocumentStatus.ANALYZED)],
         enums.NextAction.CONTACT_SERVICE, "Contacter le service"),
    ]
    for docs, action, label in cases:
        r = journey_engine.resolve(_req(docs))
        assert r.nextAction == action
        assert r.nextActionLabel == label
        assert r.nextActionReason  # toujours justifiée
        # label et raison existent dans la source unique enums
        assert getattr(enums.NextActionLabel, action.value).value == label


def test_steps_statuses_follow_dossier() -> None:
    """Étapes : Comprendre done ; Préparer active tant qu'il manque un élément."""
    r = journey_engine.resolve(
        _req(
            [
                _doc("identity", enums.DocumentStatus.ANALYZED),
                _doc("medical", enums.DocumentStatus.ANALYZED),
                _doc("photos", enums.DocumentStatus.MISSING),
            ]
        )
    )
    assert [s.id for s in r.steps] == ["understand", "prepare", "verify", "act"]
    assert [s.status for s in r.steps] == ["done", "active", "todo", "todo"]

    r2 = journey_engine.resolve(
        _req(
            [
                _doc("identity", enums.DocumentStatus.ANALYZED),
                _doc("medical", enums.DocumentStatus.ANALYZED),
                _doc("photos", enums.DocumentStatus.ANALYZED),
            ]
        )
    )
    # Dossier prêt → on arrive à l'étape Vérifier (active), Agir reste à venir.
    assert [s.status for s in r2.steps] == ["done", "done", "active", "todo"]