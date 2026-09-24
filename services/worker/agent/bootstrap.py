"""
Bootstrap : ajoute packages/shared/gen (enums générés, ADR-006/D3) au path Python.
L'import des enums se fait ici : source unique via scripts/gen-enums.mjs (parité TS ≡ Python ≡ JSON).

Usage :
    import sys; sys.path.insert(0, str(REPO_ROOT))
    from agent import ensure_paths  # puis `import enums` (module "enums" du généré)
"""
from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SHARED_GEN = REPO_ROOT / "packages" / "shared" / "gen"
DATA_DIR = REPO_ROOT / "data"

if str(SHARED_GEN) not in sys.path:
    sys.path.insert(0, str(SHARED_GEN))