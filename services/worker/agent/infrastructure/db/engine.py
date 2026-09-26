"""Engine SQLAlchemy — SAMA_DATABASE_URL (source : env, défaut SQLite local var/sama.db).

  · dev / tests : sqlite (fichier var/ ou :memory: si "sqlite://")
  · production (Brev) : postgresql+psycopg://… (SAMA_DATABASE_URL)

Le schéma + le seed sont appliqués LAZYment au premier get_session (déterministe,
sans étape manuelle) ; l'init réel d'une base PostgreSQL passe par alembic (PERS-5).
"""
from __future__ import annotations

import os
import threading
from contextlib import contextmanager
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

DEFAULT_DB_URL = "sqlite:///./var/sama.db"


def _db_url() -> str:
    return os.getenv("SAMA_DATABASE_URL", DEFAULT_DB_URL).strip()


_url = _db_url()
_engine_kwargs: dict = {}
if _url.startswith("sqlite"):
    _engine_kwargs["connect_args"] = {"check_same_thread": False}
    if _url in ("sqlite://", "sqlite:///:memory:"):
        _engine_kwargs["poolclass"] = StaticPool
    file_part = _url.removeprefix("sqlite:///")
    if file_part and file_part != ":memory:":
        Path(file_part).parent.mkdir(parents=True, exist_ok=True)
elif _url.startswith("postgresql"):
    # psycopg3 prépare une requête côté serveur (noms "_pg3_N"). Avec le pooler
    # transactionnel Supabase (PgBouncer, 6543), le backend est RESET après chaque
    # transaction : le cache client garde un nom périmé → "prepared statement
    # _pg3_N does not exist" (mesuré en live). IMPORTANT (mesuré, psycopg 3.2) :
    #   prepare_threshold=None → AUCUNE préparation serveur (0 statement)
    #   prepare_threshold=0    → « prépare immédiatement » (3 statements) ← l'ANCIEN
    #                             correctif supposait l'inverse et aggravait !
    # None garantit la compatibilité pooler transactionnel ; sans impact de perf
    # à notre échelle (une poignée de requêtes par appel).
    _engine_kwargs["connect_args"] = {"prepare_threshold": None}
    # Le pooler ferme les connexions inactives (~30 s à quelques min) : sans
    # pre_ping, la première requête après un temps mort 500 (OperationalError
    # « server closed the connection unexpectedly »). pre_ping = SELECT 1 au
    # checkout → connexion morte détectée et remplacée avant usage. Coût
    # d'un round-trip par checkout, négligeable à notre échelle.
    _engine_kwargs["pool_pre_ping"] = True

engine = create_engine(_url, **_engine_kwargs)

if _url.startswith("postgresql"):
    # VERROU de sécurité : le connect_arg peut ne pas être forwardé selon les
    # versions ; on impose prepare_threshold=None (JAMAIS préparer serveur — la
    # valeur mesurée à 0 statements) sur CHAQUE connexion physique.
    # (Attention : 0 = « prépare immédiatement », inverse de l'intention.)
    from sqlalchemy import event

    @event.listens_for(engine, "connect")
    def _no_auto_prepare(dbapi_conn, _record):  # noqa: ANN001
        threshold = getattr(dbapi_conn, "prepare_threshold", None)
        if threshold is not None:
            dbapi_conn.prepare_threshold = None

if _url.startswith("sqlite"):
    # SQLite ne vérifie PAS les FK par défaut : on les active pour attraper en dev
    # tout ordre d'insertion parents>enfants qui échouerait sur PostgreSQL (jour J).
    from sqlalchemy import event

    @event.listens_for(engine, "connect")
    def _sqlite_fk_on(dbapi_conn, _record):  # noqa: ANN001
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

_ready = False
_ready_lock = threading.Lock()


def ensure_ready() -> None:
    """Applique le schéma (create_all) puis le seed idempotent, une seule fois par process."""
    global _ready
    with _ready_lock:
        if _ready:
            return
        # Session directe (db_session ré-entrerait `ensure_ready` → verrou).
        from agent.infrastructure.db import models  # noqa: F401  (enregistre les tables)
        from agent.infrastructure.db.models import Base
        from agent.infrastructure.db.seed import seed_from_data

        Base.metadata.create_all(bind=engine)
        session = SessionLocal()
        try:
            seed_from_data(session)
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()
        _ready = True


@contextmanager
def db_session():
    """Une session transactionnelle : commit à la sortie, rollback + raise en erreur."""
    ensure_ready()
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()