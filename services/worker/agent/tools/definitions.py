"""Définitions des outils GLM (function calling) — contrat partagé vu par le modèle.

Les enum de statuts sont DÉRIVÉS de enums.json (source unique, parité TS ≡ Python ≡ JSON)
pour que la définition n'ait jamais à choisir une valeur à la main.
Le modèle ne fait que demander ; l'exécution passe TOUJOURS par le dispatcher.
"""
from __future__ import annotations

import enums

_DOCUMENT_STATUSES = [e.value for e in enums.DocumentStatus]
_NEXT_ACTIONS = [e.value for e in enums.NextAction]

glm_tool = lambda name, description, properties, required: {  # noqa: E731
    "type": "function",
    "function": {
        "name": name,
        "description": description,
        "parameters": {
            "type": "object",
            "properties": properties,
            "required": required,
        },
    },
}

GLM_TOOLS: list[dict] = [
    glm_tool(
        "get_procedure",
        "Récupère la procédure administrative (exigences obligatoires, étapes, sources enregistrées) "
        "pour un identifiant de parcours (ex. driving_license_new).",
        {"procedure_id": {"type": "string", "description": "Identifiant du parcours (driving_license_new)"}},
        ["procedure_id"],
    ),
    glm_tool(
        "get_journey_state",
        "État calculé du parcours (statut, étapes, documents, progression). TOUJOURS dérivé par le "
        "moteur déterministe, jamais inventé par le modèle.",
        {
            "journey_id": {"type": "string"},
            "documents": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "requirement_id": {"type": "string"},
                        "status": {"type": "string", "enum": _DOCUMENT_STATUSES},
                    },
                    "required": ["requirement_id", "status"],
                },
                "description": "État connu des documents (sinon le moteur complète en MISSING).",
            },
        },
        ["journey_id"],
    ),
    glm_tool(
        "get_missing_requirements",
        "Documents/réquis manquants du parcours (ce qui bloque la progression).",
        {"journey_id": {"type": "string"}},
        ["journey_id"],
    ),
    glm_tool(
        "get_next_action",
        "Prochaine action calculée par le moteur (NextAction + label + raison + exigence ciblée). "
        "Le modèle décrit, il ne décide pas.",
        {"journey_id": {"type": "string"}},
        ["journey_id"],
    ),
    glm_tool(
        "analyze_document",
        "Déclenche l'analyse réelle d'un document fourni (vision). Retourne des observations "
        "(ANALYZED / NEEDS_REVIEW / UNKNOWN) — jamais une validation officielle.",
        {
            "requirement_id": {"type": "string"},
            "journey_id": {"type": "string", "default": "driving_license_new"},
            "file_name": {"type": "string", "default": "document"},
            "content_type": {"type": "string", "description": "type MIME (image/png, image/jpeg…)"},
            "file_base64": {"type": "string", "description": "contenu du fichier encodé en base64"},
        },
        ["requirement_id", "content_type", "file_base64"],
    ),
    glm_tool(
        "get_evidence",
        "Preuve enregistrée (source, origine, limites) pour une exigence — « d'où vient cette "
        "affirmation ? » (C §66).",
        {"requirement": {"type": "string", "description": "Identifiant de l'exigence (identity, medical, photos…)"}},
        ["requirement"],
    ),
]