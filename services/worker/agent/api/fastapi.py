"""API HTTP publique (D1 — ADR-009) : contrat C §62.
FastAPI + CORS (origine web) + trace middleware (C §55) + endpoints :
  POST /api/intent · POST /api/journey · POST /api/documents/analyze
  GET  /api/evidence/:requirement · POST /api/voice/token · GET /healthz
Structure hexagonale (référence §5) : les routes appellent les USE CASES (application),
jamais le domaine ni les providers directement.
"""
from __future__ import annotations

import logging
import os
import sys
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import uvicorn
from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from livekit import api as livekit_api

from agent import mode as app_mode
from agent.infrastructure.auth.supabase import AuthContext, require_user
# Use cases — importés depuis leur module (pas via le façade `__init__`, qui ré-exporte
# les fonctions : les noms de modules et de fonctions cohabiteraient de façon ambiguë).
from agent.application.use_cases.process_intent import infer_intent
from agent.application.use_cases.analyze_document import analyze_document
from agent.application.use_cases.get_evidence import get_evidence
from agent.application.use_cases.persist_journey import apply_journey, resume_journey
from agent.application.use_cases.persist_analysis import persist_document_analysis
from agent.schemas import (
    DocumentAnalysis,
    Evidence,
    IntentRequest,
    IntentResponse,
    JourneyRequest,
    JourneyResponse,
    RequestTrace,
    VoiceToken,
)

log = logging.getLogger("sama.worker")
logging.basicConfig(level=logging.INFO)

# ── Défense en profondeur : upload borné + rate limiting (endpoints payants LLM) ──
# Note produit : un fichier non-image N'EST PAS rejeté — il part en analyse honnête
# (NEEDS_REVIEW, jamais fabriqué). La défense = taille bornée + limitation de débit ; 
# la validation de type reste la décision du domaine (content_type + provider vision).
MAX_UPLOAD_BYTES = int(os.getenv("SAMA_MAX_UPLOAD_MB", "10")) * 1024 * 1024
_RATELIMIT_MAX = int(os.getenv("SAMA_RATE_LIMIT_PER_MIN", "60"))
_RATELIMIT_WINDOW_S = 60.0
_RATELIMIT: dict[str, list[float]] = {}


def _check_rate_limit(user_id: str) -> None:
    """Borne la sur-sollicitation des endpoints qui déclenchent des appels LLM payants.

    Fenêtre glissante en mémoire (suffisant à cette échelle, sans dépendance).
    Jamais actif en mode harnais (deterministic) : la suite de test n'est pas limitée.
    """
    if not app_mode.is_live():
        return
    now = time.monotonic()
    hits = [t for t in _RATELIMIT.get(user_id, []) if now - t < _RATELIMIT_WINDOW_S]
    if len(hits) >= _RATELIMIT_MAX:
        raise HTTPException(status_code=429, detail="trop de requêtes — réessayez dans une minute")
    hits.append(now)
    _RATELIMIT[user_id] = hits


ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
LIVEKIT_URL = os.getenv("LIVEKIT_URL", "ws://localhost:7880")


@asynccontextmanager
async def lifespan(_: FastAPI):
    log.info("Sama Agent worker — up (mode=%s)", app_mode.mode())
    yield


app = FastAPI(title="Sama Agent API", version="0.2.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in ALLOWED_ORIGINS],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.middleware("http")
async def trace_middleware(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or uuid.uuid4().hex
    started = time.perf_counter()
    trace = RequestTrace(
        requestId=request_id,
        timestamp=datetime.now(timezone.utc).isoformat(),
        path=request.url.path,
    )
    try:
        response: Response = await call_next(request)
        trace.latencyMs = round((time.perf_counter() - started) * 1000, 1)
    except Exception as exc:  # log systématique (C §55) même en cas d'erreur
        trace.latencyMs = round((time.perf_counter() - started) * 1000, 1)
        trace.error = str(exc)
        log.warning("trace=%s", trace.model_dump())
        raise
    # Champs métier renseignés par les routes (pas de valeurs inventées).
    fields: dict | None = getattr(request.state, "trace_fields", None)
    if fields:
        for key, value in fields.items():
            setattr(trace, key, value)
    response.headers["x-request-id"] = request_id
    log.info("trace=%s", trace.model_dump())
    return response


@app.get("/healthz")
def healthz() -> dict:
    return {"status": "ok", "mode": app_mode.mode()}


@app.post("/api/intent", response_model=IntentResponse)
def intent(req: IntentRequest, request: Request,
           user: AuthContext = Depends(require_user)) -> IntentResponse:
    _check_rate_limit(user.user_id)
    try:
        result = infer_intent(req)
    except Exception as exc:
        # Détail technique dans la trace serveur, jamais exposé au client.
        log.warning("intent — échec de la chaîne LLM : %s", exc)
        raise HTTPException(status_code=503, detail="le service de compréhension est momentanément indisponible")
    request.state.trace_fields = {
        "intent": result.intent,
        "confidence": result.confidence,
        # Honnête, par état réel : le fallback est utilisé quand la chaîne produit
        # une clarification (confiance 0) au lieu d'une décision — règles sans
        # mot-clé en mode déterministe, sortie LLM invalide en live. Jamais deviné.
        "fallbackUsed": bool(result.needsClarification),
        "model": os.getenv("NVIDIA_MODEL", "z-ai/glm-5.3") if app_mode.is_live() else "regles-c",
    }
    return result


@app.post("/api/journey", response_model=JourneyResponse)
def journey(req: JourneyRequest, request: Request,
            user: AuthContext = Depends(require_user)) -> JourneyResponse:
    _check_rate_limit(user.user_id)
    try:
        result = apply_journey(req, user_id=user.user_id)
    except KeyError as exc:
        # Procédure inconnue : 404 métier, jamais 500.
        raise HTTPException(status_code=404, detail=f"procédure inconnue : {exc}")
    except PermissionError as exc:
        # Appropriation : un parcours d'un autre usager n'est pas modifiable.
        raise HTTPException(status_code=403, detail=str(exc))
    except Exception as exc:
        log.warning("journey — échec de la persistance du parcours : %s", exc)
        raise HTTPException(status_code=503, detail="le service de parcours est momentanément indisponible")
    request.state.trace_fields = {
        "journeyState": result.status,
    }
    return result


@app.get("/api/journey/{journey_id}", response_model=JourneyResponse)
def resume_journey_endpoint(journey_id: str, request: Request,
                            user: AuthContext = Depends(require_user)) -> JourneyResponse:
    """Reprise d'un dossier (GET resume) : l'état vient du serveur, jamais du navigateur."""
    try:
        result = resume_journey(journey_id, user_id=user.user_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"parcours inconnu : {exc}")
    request.state.trace_fields = {
        "journeyState": result.status,
    }
    return result


@app.post("/api/documents/analyze", response_model=DocumentAnalysis)
async def analyze(
    requirementId: str = Form(...),
    journeyId: str = Form(...),
    file: UploadFile = File(...),
    request: Request = None,
    user: AuthContext = Depends(require_user),
) -> DocumentAnalysis:
    _check_rate_limit(user.user_id)
    # Fichier entier borné (un upload illimité = risque mémoire). Au-delà : 413.
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="fichier trop volumineux (10 Mo maximum)")
    try:
        analysis = analyze_document(
            requirement_id=requirementId,
            file_name=file.filename or "fichier",
            file_bytes=content,
            content_type=file.content_type or "application/octet-stream",
        )
    except Exception as exc:
        log.warning("documents/analyze — échec de la chaîne vision : %s", exc)
        raise HTTPException(status_code=503, detail="l'analyse du document est momentanément indisponible")
    # Persistance réelle (documents + observations + audit) — l'état du dossier suit.
    try:
        persist_document_analysis(journeyId, analysis, file.filename or "fichier",
                                  file.content_type or "application/octet-stream",
                                  user_id=user.user_id)
    except KeyError as exc:
        # Le parcours doit exister avant tout document (FK PostgreSQL vérifiées).
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        log.warning("documents/analyze — persistance en échec : %s", exc)
        raise HTTPException(status_code=500, detail="la persistance du dossier est momentanément indisponible")
    request.state.trace_fields = {
        "documentStatus": analysis.status,
        "journeyState": journeyId,
    }
    return analysis


@app.get("/api/evidence/{requirement}", response_model=Evidence)
def evidence(requirement: str, user: AuthContext = Depends(require_user)) -> Evidence:
    try:
        return get_evidence(requirement)
    except KeyError:
        raise HTTPException(status_code=404, detail="preuve introuvable")


@app.post("/api/voice/token", response_model=VoiceToken)
def voice_token(user: AuthContext = Depends(require_user)) -> VoiceToken:
    """Token LiveKit réel (ADR-004) — le worker est l'autorité de la room."""
    _check_rate_limit(user.user_id)
    key = os.getenv("LIVEKIT_API_KEY", "devkey")
    secret = os.getenv("LIVEKIT_API_SECRET", "devsecret")
    room = os.getenv("LIVEKIT_ROOM", "sama-demo")
    identity = f"awa-{uuid.uuid4().hex[:8]}"
    if hasattr(livekit_api, "VideoGrants"):
        # livekit-api ≥ 1.x : pattern builder (grants déclarés)
        grants = livekit_api.VideoGrants(room_join=True, room=room)
        token = (
            livekit_api.AccessToken(key, secret)
            .with_identity(identity)
            .with_grants(grants)
            .to_jwt()
        )
    else:
        # livekit-api 0.x (legacy)
        at = livekit_api.AccessToken(key, secret)
        at.identity = identity
        at.add_grant(room_join=True, room=room)
        token = at.to_jwt()
    return VoiceToken(url=LIVEKIT_URL, token=token)


if __name__ == "__main__":
    if sys.platform == "win32":
        # Windows : le ProactorEventLoop meurt en charge (accept-loop → WinError 64,
        # « le nom réseau n'est plus disponible ») et tue l'API. uvicorn 0.36 passe
        # la fabrique de boucle via Config.get_loop_factory() → asyncio.run(loop_factory=…) :
        # on impose le SelectorEventLoop (sans le bug d'accept), même sur win32.
        import asyncio

        _config = uvicorn.Config(
            "agent.api.fastapi:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000"))
        )
        _config.get_loop_factory = lambda: asyncio.SelectorEventLoop
        uvicorn.Server(_config).run()
    else:
        uvicorn.run("agent.api.fastapi:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")))