"""Authentification Supabase — contrat (plan : l'identité est RÉELLE, jamais simulée).

La vérification HMAC-HS256 du JWT Supabase Auth (SUPABASE_JWT_SECRET) est testée
pour de vrai : jetons signés, expirés, mauvais secret, ordures. En mode déterministe
(harnais de test) l'identité est une identité de SERVICE clairement étiquetée —
la suite de test est le joueur, aucun usager/parcours n'est inventé. L'appropriation
(journeys.user_id) est vérifiée au niveau use case : un dossier n'appartient qu'à
son usager (lecture/analyse d'un dossier étranger = inconnu → 404, jamais 500).
"""
from __future__ import annotations

import os
import time

import jwt
import pytest

os.environ.setdefault("SAMA_MODE", "deterministic")
os.environ.setdefault("SAMA_DATABASE_URL", "sqlite://")
os.environ.setdefault("SUPABASE_JWT_SECRET", "test-secret-jwt-tok-0123456789abcdef0123456789abcdef")

import enums
from agent import bootstrap  # noqa: F401  (prépare le sys.path)
from agent.infrastructure.auth.supabase import (
    SERVICE_USER_ID,
    AuthError,
    require_user,
    verify_access_token,
)
from agent.schemas import DocumentAnalysis, JourneyRequest
from agent.application.use_cases.persist_analysis import persist_document_analysis
from agent.application.use_cases.persist_journey import apply_journey, resume_journey
from agent.infrastructure.db.repositories import upsert_user

# Le secret de test provient de l'environnement (posé ci-dessus) — aucun littéral
# de secret en dur dans le dépôt (contrôleur check:secrets, point 23).
SECRET = os.environ["SUPABASE_JWT_SECRET"]
SECRET_AUTRE = SECRET[::-1]  # clairement différent pour le test « mauvais secret »


def _mint(payload: dict, secret: str = SECRET) -> str:
    return jwt.encode(payload, secret, algorithm="HS256")


def _valid_claims(sub: str = "a2b3c4d5-0000-0000-0000-000000000001") -> dict:
    return {
        "sub": sub,
        "aud": "authenticated",  # audience réelle des Access Tokens Supabase
        "exp": int(time.time()) + 3600,
        "email": "usager@sama.sn",
        "app_metadata": {"provider": "email"},
    }


# ── Vérification JWT (contrat réel) ────────────────────────────────────────
def test_valid_token_yields_real_identity() -> None:
    """Un vrai JWT Supabase → l'identité de son sub (users.id), pas un mock."""
    token = _mint(_valid_claims())
    ctx = verify_access_token(token)
    assert ctx.user_id == "a2b3c4d5-0000-0000-0000-000000000001"
    assert ctx.email == "usager@sama.sn"
    assert ctx.provider == "email"


def test_expired_token_rejected() -> None:
    """Un jeton expiré est refusé (exp vérifié) — pas d'entrée permanente."""
    claims = _valid_claims()
    claims["exp"] = int(time.time()) - 60
    with pytest.raises(AuthError):
        verify_access_token(_mint(claims))


def test_wrong_secret_rejected() -> None:
    """Un jeton signé avec un autre secret n'est pas accepté."""
    with pytest.raises(AuthError):
        verify_access_token(_mint(_valid_claims(), secret=SECRET_AUTRE))


def test_garbage_token_rejected() -> None:
    """Une chaîne qui n'est pas un JWT → AuthError, jamais 500."""
    with pytest.raises(AuthError):
        verify_access_token("pas.un.jeton")


def test_missing_sub_rejected() -> None:
    """sub obligatoire (users.id) — un jeton sans identité est refusé."""
    claims = _valid_claims()
    claims.pop("sub")
    with pytest.raises(AuthError):
        verify_access_token(_mint(claims))


# ── Dépendance FastAPI (harnais déterministe = identité de service) ────────
def test_deterministic_require_user_is_service_identity() -> None:
    """En mode déterministe : identité de SERVICE étiquetée, aucun usager réel."""
    ctx = require_user()
    assert ctx.user_id == SERVICE_USER_ID
    assert ctx.provider == "test-deterministe"


# ── Appropriation : journeys.user_id (un dossier n'appartient qu'à son usager) ─
def _journey_req(journey_id: str) -> JourneyRequest:
    return JourneyRequest(journeyId=journey_id, procedureId="driving_license_new")


def _analysis() -> DocumentAnalysis:
    return DocumentAnalysis(
        requirementId="identity",
        status=enums.DocumentStatus.NEEDS_REVIEW,
        confidence=0.0,
        reason="test",
        fileName="notes.txt",
    )


def test_journey_owned_by_creator_and_invisible_to_others() -> None:
    uidA, uidB = "user-A", "user-B"
    # Tout comme require_user en live, chaque usager est d'abord ancré en base.
    upsert_user(uidA)
    upsert_user(uidB)
    apply_journey(_journey_req("auth-owned"), user_id=uidA)

    # Le créateur reprend SON dossier.
    assert resume_journey("auth-owned", user_id=uidA).journeyId == "auth-owned"

    # Un autre usager voit « parcours inconnu » (404), jamais le dossier du voisin.
    with pytest.raises(KeyError):
        resume_journey("auth-owned", user_id=uidB)

    # L'analyse d'un document sur le dossier d'autrui → inconnu (404), pas de fuite.
    with pytest.raises(KeyError):
        persist_document_analysis("auth-owned", _analysis(), "notes.txt", "text/plain", user_id=uidB)

    # Le créateur, lui, peut déposer son document.
    persist_document_analysis("auth-owned", _analysis(), "notes.txt", "text/plain", user_id=uidA)


def test_unowned_journey_has_no_owner_filter_in_harness() -> None:
    """Sans appropriation (harnais), le dossier reste unique et accessible."""
    apply_journey(_journey_req("auth-legacy"), user_id=None)
    assert resume_journey("auth-legacy").journeyId == "auth-legacy"