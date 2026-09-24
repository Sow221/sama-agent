"""
Document Engine — analyse réelle d'un document fourni par l'utilisateur (B §37, G11).
Chaîne : fichier réel (image/pdf) → vision multimodal (GLM-5.3-Flash / nemotron-parse-2.0).
Statuts possibles uniquement : ANALYZED / NEEDS_REVIEW / UNEXPECTED / UNKNOWN.
- JAMAIS de statut "validé par l'IA" (G11) ni d'analyse simulée (règle fondatrice).
- Sortie = observations factuelles (point 7) + recommandation requiresHumanReview,
  jamais une certification officielle.
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
    # Membres générés (nom = valeur canonique lowercase, cf. spec ADR-007).
    "carte": enums.DocumentType.identity_document,
    "identité": enums.DocumentType.identity_document,
    "id card": enums.DocumentType.identity_document,
    "medical": enums.DocumentType.medical_certificate,
    "certificat": enums.DocumentType.medical_certificate,
    "photo": enums.DocumentType.photo,
}
BLUR_SIGNALS = ("flou", "illisible", "blurry", "unreadable")

# Observations factuelles (G11) — dérivées du résultat réel de la vision.
_OBS_READABLE = "document lisible détecté"
_OBS_TEXT = "texte détecté"
_OBS_IDENTITY = "informations d'identité visibles"
_OBS_TYPE = lambda ctype: f"type détecté : {ctype}"


def analyze(requirement_id: str, file_name: str, file_bytes: bytes, content_type: str) -> DocumentAnalysis:
    if not app_mode.is_live():
        # Honnête : aucun modèle disponible → jamais "conforme".
        return DocumentAnalysis(
            requirementId=requirement_id,
            status=enums.DocumentStatus.NEEDS_REVIEW,
            fileName=file_name,
            reason="Analyse indisponible (mode déterministe) : à vérifier par le service.",
            observations=[
                "analyse automatique indisponible dans cet environnement",
                "exigence à vérifier par le service compétent",
            ],
            requiresHumanReview=True,
        )

    llm = GlmLlm()
    prompt = (
        "Document administratif fourni pour une demande de permis de conduire au Sénégal. "
        "Réponds en JSON avec : "
        '{"contentType": "carte(CCI/CNI)|medical|certificat|photo|autre", '
        '"readable": bool, "matchesExpected": bool, "reason": string, "confidence": 0..1}. '
        "Attendu : un document net et lisible. Ne jamais déclarer valide un document flou."
        "Rapporte uniquement des observations factuelles, jamais une validation officielle."
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
            observations=["format non analysable automatiquement", "à vérifier par le service"],
            requiresHumanReview=True,
        )

    try:
        raw = llm.chat_json_multimodal(prompt, [payload])
    except Exception as exc:  # réseau / modèle indisponible : on ne fabrique jamais un succès
        return DocumentAnalysis(
            requirementId=requirement_id,
            status=enums.DocumentStatus.UNKNOWN,
            fileName=file_name,
            reason=f"Analyse impossible : {exc}",
            observations=["analyse interrompue (service de vision indisponible)"],
            requiresHumanReview=True,
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
            observations=["document flou ou illisible", "texte non fiable détecté"],
            requiresHumanReview=True,
        )
    matched = MATCH_RULES.get(ctype)
    if matches and matched is not None:
        obs = [_OBS_TEXT, _OBS_READABLE, _OBS_TYPE(ctype)] + (
            [_OBS_IDENTITY] if matched == enums.DocumentType.identity_document else []
        )
        return DocumentAnalysis(
            requirementId=requirement_id,
            status=enums.DocumentStatus.ANALYZED,
            matchedType=matched,
            confidence=confidence,
            fileName=file_name,
            reason=reason,
            observations=obs,
            # ANALYZED ≠ certifié : une vérification humaine reste possible si faible confiance.
            requiresHumanReview=confidence < 0.8,
        )
    return DocumentAnalysis(
        requirementId=requirement_id,
        status=enums.DocumentStatus.UNEXPECTED,
        fileName=file_name,
        reason="Le document ne correspond pas à l'élément attendu.",
        observations=[f"contenu détecté : {ctype}", "ne correspond pas à l'élément attendu"],
        requiresHumanReview=True,
    )