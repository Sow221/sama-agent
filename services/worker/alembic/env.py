"""Environnement Alembic du worker — migrations du schéma (référence §7.3, 16 tables).

L'URL vient de SAMA_DATABASE_URL (PostgreSQL Brev au jour J, SQLite en dev/tests).
Lancement depuis services/worker :
    $env:SAMA_DATABASE_URL="sqlite:///./var/alembic_dev.db"
    python -m alembic upgrade head          # applique la migration courante
    python -m alembic revision --autogenerate -m "message"   # nouvelle migration
"""
from __future__ import annotations

import os
import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import engine_from_config, pool

# ── Path (worker + enums générés) avant tout import agent ──────────────────
WORKER = Path(__file__).resolve().parents[1]
REPO = WORKER.parents[1]
for p in (str(WORKER), str(REPO / "packages" / "shared" / "gen")):
    if p not in sys.path:
        sys.path.insert(0, p)

from agent.infrastructure.db.models import Base  # noqa: E402  (schéma cible)

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# ConfigParser interpole % …% : une URL avec des séquences encodées (%2F, %40…)
# ferait échouer Alembic. On échappe % en %% (la lecture désinterpole proprement).
_url = os.getenv("SAMA_DATABASE_URL", "sqlite:///./var/alembic.db")
config.set_main_option("sqlalchemy.url", _url.replace("%", "%%"))

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True,
                      dialect_opts={"paramstyle": "named"})
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()