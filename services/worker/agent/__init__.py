"""Package agent du worker Sama Agent.

Importé systématiquement AVANT tout `import enums` : prépare le sys.path
vers packages/shared/gen (enums générés, ADR-006/D3/parité).
"""
from agent.bootstrap import (
    REPO_ROOT,
    DATA_DIR,
    SHARED_GEN,
)  # noqa: F401  (effet de bord : insertion sys.path)