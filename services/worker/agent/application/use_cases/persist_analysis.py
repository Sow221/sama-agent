"""Use case : persister une analyse de document (documents + observations + audit).

L'analyse elle-même reste celle de analyze_document (vision réelle / NEEDS_REVIEW
honnête) ; ici on fige la trace : documents, document_observations (jamais un
statut VALIDATED), et l'état du dossier pour cette exigence.
"""
from __future__ import annotations

from agent.infrastructure.db.repositories import record_document
from agent.schemas import DocumentAnalysis


def persist_document_analysis(journey_id: str, analysis: DocumentAnalysis,
                              file_name: str, mime_type: str) -> None:
    record_document(journey_id, analysis, file_name, mime_type)