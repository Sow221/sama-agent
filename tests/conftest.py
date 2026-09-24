"""Accroche sys.path commune à tous les tests — le worker importe `agent` depuis
services/worker et `enums` depuis packages/shared/gen (source unique, ADR-006/D3)."""
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
for rel in ("services/worker", "packages/shared/gen"):
    p = str(REPO_ROOT / rel)
    if p not in sys.path:
        sys.path.insert(0, p)