"""
Document Engine — analyse réelle d'un document fourni par l'utilisateur (B §37, G11).
Chaîne : fichier réel (image/pdf) → vision multimodal (GLM-5.3-Flash / nemotron-parse-2.0).
Statuts possibles uniquement : ANALYZED / NEEDS_REVIEW / UNEXPECTED / UNKNOWN.
JAMAIS de statut "validé par l'IA" (G11) et JAMAIS d'analyse simulée (règle fondatrice).
En mode deterministic : le document n'est pas analysé → NEEDS_REVIEW honnête (C §54).
"""
from __future__ import annotations

import base64
import os

from agent import mode as app_mode
from agent.schemas import DocumentAnalysis
from agent.engines.intent_engine import GlmLlm
import enums

MATCH_RULES: dict[str, enums.DocumentType] = {
    "carte": enums.DocumentType.IDENTITY_DOCUMENT,
    "identité": enums.DocumentType.IDENTITY_DOCUMENT,
    "id card": enums.DocumentType.IDENTITY_DOCUMENT,
    "medical": enums.DocumentType.MEDICAL_CERTIFICATE,
    "certificat": enums.DocumentType.MEDICAL_CERTIFICATE,
    "photo": enums.DocumentType.PHOTO,
}
BLUR_SIGNALS = ("flou", "illisible", "blurry", "unreadable")


def analyze(requirement_id: str, file_name: str, file_bytes: bytes, content_type: str) -> DocumentAnalysis:
    if not app_mode.is_live():
        # Honnête : aucun modèle disponible → jamais "conforme".
        return DocumentAnalysis(
            requirementId=requirement_id,
            status=enums.DocumentStatus.NEEDS_REVIEW,
            fileName=file_name,
            reason="Analyse indisponible (mode déterministe) : à vérifier par le service.",
        )

    llm = GlmLlm()
    prompt = (
        "Document administratif fourni pour une demande de permis de conduire au Sénégal. "
        "Réponds en JSON avec : "
        '{"contentType": "carte(CCI/CNI)|medical|certificat|photo|autre", '
        '"readable": bool, "matchesExpected": bool, "reason": string, "confidence": 0..1}. '
        "Attendu : un document net et lisible. Ne jamais déclarer valide un document flou."
    )

    # image → base64 (le document est passé en image). PDF : signalé tel quel (format non géré jour J).
    if content_type.startswith("image/"):
        payload = {"type": "image_url", "image_url": {"url": f"data:{content_type};base64,{base64.b64encode(file_bytes).decode()}"}}
    else:
        return DocumentAnalysis(
            requirementId=requirement_id,
            status=enums.DocumentStatus.NEEDS_REVIEW,
            fileName=file_name,
            reason="Format non pris en charge pour l'analyse automatique.",
        )

    try:
        raw = llm.chat_json_multimodal(prompt, [payload])
    except Exception as exc:  # réseau / modèle indisponible : on ne fabrique jamais un succès
        return DocumentAnalysis(
            requirementId=requirement_id,
            status=enums.DocumentStatus.UNKNOWN,
            fileName=file_name,
            reason=f"Analyse impossible : {exc}",
        )

    ctype = str(raw.get("contentType", "")).lower()
    readable = bool(raw.get("readable"))
    matches = bool(raw.get("matchesExpected"))
    confidence = float(raw.get("confidence", 0.0))
    reason = str(raw.get("reason", ""))

    if not readable or any(s in reason.lower() for s in BLUR_SIGNALS):
        return DocumentAnalysis(
            requirementId=requirement_id,
            status=enums.DocumentStatus.NEEDS_REVIEW,
            fileName=file_name,
            reason=reason or "Document flou ou illisible — à vérifier.",
        )
    matched = MATCH_RULES.get(ctype)
    if matches and matched is not None:
        return DocumentAnalysis(
            requirementId=requirement_id,
            status=enums.DocumentStatus.ANALYZED,
            matchedType=matched,
            confidence=confidence,
            fileName=file_name,
            reason=reason,
        )
    return DocumentAnalysis(
        requirementId=requirement_id,
        status=enums.DocumentStatus.UNEXPECTED,
        fileName=file_name,
        reason="Le document ne correspond pas à l'élément attendu.",
    )