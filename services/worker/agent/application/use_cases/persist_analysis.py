"""Use case : persister une analyse de document (documents + observations + audit).

L'analyse elle-même reste celle de analyze_document (vision réelle / NEEDS_REVIEW
honnête) ; ici on fige la trace : documents, document_observations (jamais un
statut VALIDATED), et l'état du dossier pour cette exigence.
"""
from __future__ import annotations

from agent.infrastructure.db.repositories import load_journey_state, record_document
from agent.schemas import DocumentAnalysis


def persist_document_analysis(journey_id: str, analysis: DocumentAnalysis,
                              file_name: str, mime_type: str,
                              user_id: str | None = None) -> None:
    # Contrat : le parcours doit exister (créé par POST /api/journey) et appartenir
    # à l'usager (live). PostgreSQL vérifie les FK — un document ne peut pas naître
    # pour un dossier inconnu ou volé. (retour 404 métier, jamais 500)
    if load_journey_state(journey_id, user_id=user_id) is None:
        raise KeyError(f"parcours inconnu : {journey_id}")
    record_document(journey_id, analysis, file_name, mime_type)