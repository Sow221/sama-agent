"""Vérifie que l'entrée vocale échoue de façon ACTIONNABLE, pas par ModuleNotFoundError brut.

Avant : `import agent.voice.main` levait
    ModuleNotFoundError: No module named 'numpy'
sans dire quoi installer ni ce qui reste utilisable. C'est ce qui a rendu la
chaîne vocale invisible : on croyait à un problème d'environnement, pas à une
dépendance déclarée.
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

# tests/matrix/<ce fichier> -> racine du dépôt deux niveaux plus haut.
ROOT = Path(__file__).resolve().parents[2]
WORKER = ROOT / "services" / "worker"
GEN = ROOT / "packages" / "shared" / "gen"

_ENTRYPOINT_PROBE = """
import sys
sys.path.insert(0, sys.argv[1])
sys.path.insert(0, sys.argv[2])
try:
    import agent.voice.main  # noqa: F401
    print("IMPORT_OK")
except ImportError as exc:
    print("IMPORT_FAIL")
    print("MSG:" + str(exc))
except Exception as exc:
    print("OTHER:" + type(exc).__name__ + ": " + str(exc))
"""

# Les trois modules qui portent la logique vocale doivent rester importables
# sans numpy/torch/transformers/TTS/livekit : c'est la garantie de testabilité
# qui avait été perdue en mettant tout derrière `import numpy`.
_PURITY_PROBE = """
import sys
sys.path.insert(0, sys.argv[1])
sys.path.insert(0, sys.argv[2])
import agent.voice.audio
import agent.voice.protocol
import agent.voice.session

banned = {"numpy", "torch", "transformers", "TTS", "livekit"}
leaked = sorted({m.split(".")[0] for m in sys.modules} & banned)
assert not leaked, "dependances lourdes importees : " + repr(leaked)
print("PURE_OK")
"""


def _run(probe: str) -> str:
    out = subprocess.run(
        [sys.executable, "-c", probe, str(WORKER), str(GEN)],
        capture_output=True, text=True, cwd=str(ROOT), timeout=180,
    )
    return out.stdout + ("\n[stderr]\n" + out.stderr if out.stderr.strip() else "")


def test_voice_entrypoint_fails_with_install_instructions() -> None:
    result = _run(_ENTRYPOINT_PROBE)
    if "IMPORT_OK" in result:
        # livekit-agents EST installé sur ce poste : la boucle vocale est
        # réellement lançable, et ce test n'a plus d'objet.
        return
    assert "IMPORT_FAIL" in result, f"Comportement inattendu :\n{result}"
    msg = result.split("MSG:", 1)[1]
    # Le message doit dire QUOI installer...
    assert "livekit-agents" in msg, msg
    assert "pip install" in msg, msg
    # ...et ce qui reste utilisable : un dégradé honnête, pas une panne totale.
    assert "saisie texte" in msg, msg


def test_pure_voice_modules_import_without_heavy_dependencies() -> None:
    """audio / protocol / session n'importent QUE la stdlib : testables sans GPU."""
    result = _run(_PURITY_PROBE)
    assert "PURE_OK" in result, result
