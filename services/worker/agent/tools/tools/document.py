"""Outil « analyse de document » — déclenche l'analyse RÉELLE via le use case.

Le fichier arrive base64 (transfert par la boucle/le client) ; le use case décide :
  · mode deterministic / format non-image → NEEDS_REVIEW honnête (jamais « validé »),
  · mode live → vision GLM → observations → classification du domaine (ANALYZED ≠ VALIDATED).
"""
from __future__ import annotations

import base64

from agent.application.use_cases.analyze_document import analyze_document as analyze_document_uc


def analyze_document(arguments: dict) -> dict:
    requirement_id = arguments["requirement_id"]
    journey_id = arguments.get("journey_id", "driving_license_new")
    file_name = arguments.get("file_name", "document")
    content_type = arguments.get("content_type", "application/octet-stream")
    b64 = arguments.get("file_base64")
    if not b64:
        raise ValueError("file_base64 requis pour l'analyse d'un document")
    try:
        raw = base64.b64decode(b64, validate=True)
    except (ValueError, TypeError) as exc:
        raise ValueError(f"file_base64 invalide : {exc}")
    if not raw:
        raise ValueError("fichier vide — rien à analyser")
    result = analyze_document_uc(requirement_id, file_name, raw, content_type)
    return result.model_dump()