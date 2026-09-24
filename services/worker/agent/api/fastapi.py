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
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import uvicorn
from fastapi import FastAPI, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from livekit import api as livekit_api

from agent import mode as app_mode
# Use cases — importés depuis leur module (pas via le façade `__init__`, qui ré-exporte
# les fonctions : les noms de modules et de fonctions cohabiteraient de façon ambiguë).
from agent.application.use_cases.process_intent import infer_intent
from agent.application.use_cases.get_journey import get_journey
from agent.application.use_cases.analyze_document import analyze_document
from agent.application.use_cases.get_evidence import get_evidence
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
def intent(req: IntentRequest, request: Request) -> IntentResponse:
    try:
        result = infer_intent(req)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"intent indisponible : {exc}")
    request.state.trace_fields = {
        "intent": result.intent,
        "confidence": result.confidence,
        # Honnête : le fallback est utilisé en mode deterministic (règles) ; en live ce
        # n'est pas le cas (l'échec LLM → clarification confiance 0, jamais fabriqué).
        "fallbackUsed": not app_mode.is_live(),
        "model": "glm-5.3-flash" if app_mode.is_live() else "regles-c",
    }
    return result


@app.post("/api/journey", response_model=JourneyResponse)
def journey(req: JourneyRequest, request: Request) -> JourneyResponse:
    try:
        result = get_journey(req)
    except KeyError as exc:
        # Procédure inconnue : 404 métier, jamais 500.
        raise HTTPException(status_code=404, detail=f"procédure inconnue : {exc}")
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
) -> DocumentAnalysis:
    try:
        content = await file.read()
        analysis = analyze_document(
            requirement_id=requirementId,
            file_name=file.filename or "fichier",
            file_bytes=content,
            content_type=file.content_type or "application/octet-stream",
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"analyse indisponible : {exc}")
    request.state.trace_fields = {
        "documentStatus": analysis.status,
        "journeyState": journeyId,
    }
    return analysis


@app.get("/api/evidence/{requirement}", response_model=Evidence)
def evidence(requirement: str) -> Evidence:
    try:
        return get_evidence(requirement)
    except KeyError:
        raise HTTPException(status_code=404, detail="preuve introuvable")


@app.post("/api/voice/token", response_model=VoiceToken)
def voice_token() -> VoiceToken:
    """Token LiveKit réel (ADR-004) — le worker est l'autorité de la room."""
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
    uvicorn.run("agent.api.fastapi:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")))