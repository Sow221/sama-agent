"""
API HTTP publique (D1 — ADR-009) : contrat C §62.
FastAPI + CORS (origine web) + trace middleware (C §55) + endpoints :
  POST /api/intent · POST /api/journey · POST /api/documents/analyze
  GET  /api/evidence/:requirement · POST /api/voice/token · GET /healthz
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

from agent.engines import document_engine, evidence_engine, intent_engine, journey_engine
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
    log.info("Sama Agent worker — up (mode=%s)", os.getenv("SAMA_MODE", "live"))
    yield


app = FastAPI(title="Sama Agent API", version="0.1.0", lifespan=lifespan)
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
        response.headers["x-request-id"] = request_id
        return response
    except Exception as exc:  # log systématique (C §55) même en cas d'erreur
        trace.latencyMs = round((time.perf_counter() - started) * 1000, 1)
        trace.error = str(exc)
        log.warning("trace=%s", trace.model_dump())
        raise


@app.get("/healthz")
def healthz() -> dict:
    return {"status": "ok", "mode": os.getenv("SAMA_MODE", "live")}


@app.post("/api/intent", response_model=IntentResponse)
def intent(req: IntentRequest) -> IntentResponse:
    try:
        return intent_engine.infer_intent(req)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"intent indisponible : {exc}")


@app.post("/api/journey", response_model=JourneyResponse)
def journey(req: JourneyRequest) -> JourneyResponse:
    return journey_engine.resolve(req)


@app.post("/api/documents/analyze", response_model=DocumentAnalysis)
async def analyze(
    requirementId: str = Form(...),
    journeyId: str = Form(...),
    file: UploadFile = File(...),
) -> DocumentAnalysis:
    try:
        content = await file.read()
        return document_engine.analyze(
            requirement_id=requirementId,
            file_name=file.filename or "fichier",
            file_bytes=content,
            content_type=file.content_type or "application/octet-stream",
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"analyse indisponible : {exc}")


@app.get("/api/evidence/{requirement}", response_model=Evidence)
def evidence(requirement: str) -> Evidence:
    try:
        return evidence_engine.lookup(requirement)
    except KeyError:
        raise HTTPException(status_code=404, detail="preuve introuvable")


@app.post("/api/voice/token", response_model=VoiceToken)
def voice_token() -> VoiceToken:
    """Token LiveKit réel (ADR-004) — le worker est l'autorité de la room."""
    key = os.getenv("LIVEKIT_API_KEY", "devkey")
    secret = os.getenv("LIVEKIT_API_SECRET", "devsecret")
    room = os.getenv("LIVEKIT_ROOM", "sama-demo")
    at = livekit_api.AccessToken(key, secret)
    at.identity = f"awa-{uuid.uuid4().hex[:8]}"
    at.add_grant(room_join=True, room=room)
    return VoiceToken(url=LIVEKIT_URL, token=at.to_jwt())


if __name__ == "__main__":
    uvicorn.run("serve.fastapi:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")))