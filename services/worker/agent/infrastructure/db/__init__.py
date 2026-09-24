"""Persistance — PostgresSQL à la cible (Brev, jour J) via SAMA_DATABASE_URL,
SQLite local pour dev/tests (défaut var/sama.db).

  engine.py         engine + sessions (SAMA_DATABASE_URL)
  models.py         16 tables de la référence §7.3 (SQLAlchemy 2.0)
  seed.py           seed idempotent depuis data/procedures + data/evidence
  repositories.py   accès concrets (journey, documents, tool_calls, audit)

PostgreSQL = source de vérité structurée (référence §7) : l'état du dossier vient
de journeys + journey_requirements (rechargé en GET resume), jamais de l'historique
conversationnel (agent_messages n'est PAS l'état du parcours).
"""