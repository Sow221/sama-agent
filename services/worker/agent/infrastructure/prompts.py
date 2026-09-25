"""Prompts versionnés — source : `prompts/` à la racine du dépôt (référence §10, reproductible).

Arborescence :
  prompts/system/<v>.md              rôle système de l'agent
  prompts/intent/<v>.md              guidance d'intention (sortie JSON stricte)
  prompts/document/<v>.md            guidance vision (description factuelle)
  prompts/extract/<v>.md             structuration JSON de l'observation vision
  prompts/response/<v>.md            formulation vocale wolof (templates)

Le code référence une VERSION (intent:v2, document:v1). Par défaut : dernière version
numérique ; sinon variable d'env SAMA_PROMPT_VERSION (ex. "v2") pour rejouer une évaluation.
"""
from __future__ import annotations

import os
import re
from functools import lru_cache
from pathlib import Path

from agent.bootstrap import REPO_ROOT

PROMPTS_DIR = REPO_ROOT / "prompts"
ALLOWED_KINDS = ("system", "intent", "document", "extract", "response")

_VERSION_RE = re.compile(r"^v(\d+)\.md$")


def _resolve_version(kind: str, version: str | None) -> str:
    if version is not None and not version.startswith("v"):
        version = f"v{version}"
    if version and version != "latest":
        # Version explicite → nom de FICHIER : toujours l'extension .md (le glob
        # "latest" renvoie déjà "<v>.md" ; une version nue "v2" ferait échouer la
        # lecture sur "<kind>/v2" sans extension).
        return version if version.endswith(".md") else f"{version}.md"
    candidates = []
    for path in (PROMPTS_DIR / kind).glob("*.md"):
        m = _VERSION_RE.match(path.name)
        if m:
            candidates.append((int(m.group(1)), path.name))
    if not candidates:
        raise FileNotFoundError(f"aucun prompt {kind!r} dans {PROMPTS_DIR / kind}")
    return max(candidates, key=lambda c: c[0])[1]


@lru_cache(maxsize=64)
def load_prompt(kind: str, version: str | None = None) -> str:
    if kind not in ALLOWED_KINDS:
        raise ValueError(f"kind de prompt inconnu : {kind} (attendu: {'|'.join(ALLOWED_KINDS)})")
    file_name = _resolve_version(kind, version or os.getenv("SAMA_PROMPT_VERSION", "latest"))
    path = PROMPTS_DIR / kind / file_name
    return path.read_text("utf-8").strip()


def pinned_version(kind: str) -> str:
    """Version effectivement résolue (pour la trace observabilité / repro)."""
    return _resolve_version(kind, os.getenv("SAMA_PROMPT_VERSION", "latest"))