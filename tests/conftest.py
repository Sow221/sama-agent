"""Accroche sys.path commune à tous les tests — le worker importe `agent` depuis
services/worker et `enums` depuis packages/shared/gen (source unique, ADR-006/D3).
⚠ Ordre important : SAMA_MODE et SAMA_DATABASE_URL sont posés AVANT tout import
agent (modes et engine SQLAlchemy sont créés/tamponnés à l'import).
"""
import os
import sys
from pathlib import Path

os.environ.setdefault("SAMA_MODE", "deterministic")
os.environ.setdefault("SAMA_DATABASE_URL", "sqlite://")  # base en mémoire (StaticPool)

REPO_ROOT = Path(__file__).resolve().parents[1]
for rel in ("services/worker", "packages/shared/gen"):
    p = str(REPO_ROOT / rel)
    if p not in sys.path:
        sys.path.insert(0, p)