"""Authentification API (infrastructure) — JWT Supabase Auth (email/password + Google).

En live (SAMA_MODE=live), chaque route protégée exige un jeton Access Token émis par
Supabase Auth, vérifié HMAC-HS256 avec `SUPABASE_JWT_SECRET` (secret du projet
Supabase, jamais commité). L'identité réelle est `sub` = users.id ; les journeys
sont liés à l'utilisateur via journeys.user_id (appropriation stricte : on ne
consulte/modifie que ses propres dossiers).

En mode déterministe (harnais de test) : identité de SERVICE clairement étiquetée
(`service-deterministe`) — aucun usager réel, aucun parcours simulé : la suite de
test est le joueur. La production (live) n'accepte qu'un vrai JWT.
"""
from __future__ import annotations

import os

import jwt
from fastapi import Header, HTTPException

from agent import mode as app_mode
from agent.infrastructure.db.repositories import upsert_user

JWT_ALGO = "HS256"
SERVICE_USER_ID = "service-deterministe"


class AuthError(Exception):
    """Jeton absent/invalide ou secret non configuré."""


class AuthContext:
    """Identité vérifiée d'un appel — user_id = users.id (source d'appropriation)."""

    __slots__ = ("user_id", "email", "provider")

    def __init__(self, user_id: str, email: str | None = None, provider: str | None = None) -> None:
        self.user_id = user_id
        self.email = email
        self.provider = provider


def verify_access_token(access_token: str) -> AuthContext:
    """Vérifie un JWT Supabase (HS256, exp + sub obligatoires). AuthError si invalide."""
    secret = os.getenv("SUPABASE_JWT_SECRET", "")
    if not secret:
        raise AuthError("SUPABASE_JWT_SECRET non configuré")
    try:
        claims = jwt.decode(
            access_token,
            secret,
            algorithms=[JWT_ALGO],
            # PyJWT rejette tout jeton portant `aud` si l'audience d'attente n'est
            # pas fournie. Les Access Tokens Supabase portent `aud="authenticated"` :
            # sans cette option, TOUT login réel serait refusé (Invalid audience).
            audience="authenticated",
            options={"require": ["exp", "sub"]},
        )
    except jwt.InvalidTokenError as exc:
        raise AuthError(f"jeton invalide : {exc}") from exc
    meta = claims.get("app_metadata") or {}
    return AuthContext(
        user_id=str(claims["sub"]),
        email=claims.get("email"),
        provider=meta.get("provider"),
    )


def require_user(authorization: str | None = Header(default=None)) -> AuthContext:
    """Dépendance FastAPI : identité de l'appel — 401 si non authentifié en live."""
    if not app_mode.is_live():
        # Harnais déterministe : identité de service étiquetée (jamais un usager
        # réel), ancrée en base pour préserver l'intégrité des FK.
        upsert_user(SERVICE_USER_ID)
        return AuthContext(user_id=SERVICE_USER_ID, provider="test-deterministe")
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="authentification requise")
    token = authorization.split(" ", 1)[1].strip()
    try:
        ctx = verify_access_token(token)
    except AuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    # L'usager existe réellement en base (ancre users.id → journeys.user_id).
    upsert_user(ctx.user_id)
    return ctx