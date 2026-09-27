"""Authentification API (infrastructure) — JWT Supabase Auth (email/password + Google).

En live (SAMA_MODE=live), chaque route protégée exige un jeton Access Token émis par
Supabase Auth. Deux signatures existent selon l'âge du projet Supabase :
  - clés asymétriques (ES256/RS256, défaut des projets récents) : clé publique lue
    sur `SUPABASE_URL/auth/v1/.well-known/jwks.json` (mise en cache) ;
  - ancien secret partagé (HS256) : `SUPABASE_JWT_SECRET` (jamais commité).
⚠ Avant, seul HS256 était accepté : sur un projet récent, TOUTE connexion réelle
était refusée (401). L'algorithme est pris dans une liste fermée — jamais `none`,
jamais un HS256 vérifié avec une clé publique. L'identité réelle est `sub` = users.id ; les journeys
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
ASYMMETRIC_ALGOS = ("ES256", "RS256")
_jwks_clients: dict[str, "jwt.PyJWKClient"] = {}


def _supabase_url() -> str:
    return os.getenv("SUPABASE_URL", "").rstrip("/")


def _jwks_client(base_url: str) -> "jwt.PyJWKClient":
    """Client JWKS mis en cache (clés publiques du projet, rafraîchies par PyJWT)."""
    client = _jwks_clients.get(base_url)
    if client is None:
        client = jwt.PyJWKClient(f"{base_url}/auth/v1/.well-known/jwks.json", cache_keys=True, lifespan=3600)
        _jwks_clients[base_url] = client
    return client
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
    """Vérifie un JWT Supabase (ES256/RS256 via JWKS, ou HS256 via secret ; exp + sub obligatoires)."""
    try:
        alg = jwt.get_unverified_header(access_token).get("alg")
    except jwt.InvalidTokenError as exc:
        raise AuthError(f"jeton invalide : {exc}") from exc

    base_url = _supabase_url()
    if alg in ASYMMETRIC_ALGOS:
        if not base_url:
            raise AuthError("SUPABASE_URL non configuré (clés de signature asymétriques)")
        try:
            key = _jwks_client(base_url).get_signing_key_from_jwt(access_token).key
        except jwt.PyJWKClientError as exc:
            raise AuthError(f"clé de signature introuvable : {exc}") from exc
        algorithms = [alg]
    elif alg == JWT_ALGO:
        key = os.getenv("SUPABASE_JWT_SECRET", "")
        if not key:
            raise AuthError("SUPABASE_JWT_SECRET non configuré")
        algorithms = [JWT_ALGO]
    else:
        raise AuthError(f"algorithme de signature refusé : {alg}")

    try:
        claims = jwt.decode(
            access_token,
            key,
            algorithms=algorithms,
            # PyJWT rejette tout jeton portant `aud` si l'audience d'attente n'est
            # pas fournie. Les Access Tokens Supabase portent `aud="authenticated"` :
            # sans cette option, TOUT login réel serait refusé (Invalid audience).
            audience="authenticated",
            # Émetteur vérifié quand le projet est connu : un jeton d'un AUTRE
            # projet Supabase est refusé.
            issuer=f"{base_url}/auth/v1" if base_url else None,
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