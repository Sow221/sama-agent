#!/usr/bin/env bash
# Installation du nœud Brev (une seule fois). Aucun secret ici.
#   bash infra/brev/setup-brev.sh
# Les secrets vont dans ~/sama.env (sur la machine Brev, jamais dans le dépôt) :
#   cp infra/brev/sama.env.example ~/sama.env && nano ~/sama.env
set -euo pipefail
cd "$(dirname "$0")/../.."

echo "[1/4] GPU"
nvidia-smi --query-gpu=name,memory.total --format=csv || echo "⚠ nvidia-smi absent : pas de GPU visible"

echo "[2/4] Environnement Python (services/worker/.venv)"
python3 --version
python3 -m venv services/worker/.venv
# shellcheck disable=SC1091
source services/worker/.venv/bin/activate
pip install --upgrade pip
pip install -e services/worker

echo "[3/4] cloudflared (adresse HTTPS publique de l'API, sans compte)"
if ! command -v cloudflared >/dev/null; then
  curl -fsSL -o /tmp/cloudflared.deb \
    https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
  sudo dpkg -i /tmp/cloudflared.deb
fi
cloudflared --version

echo "[4/4] Variables requises (valeurs jamais affichées)"
bash infra/brev/check-env.sh || true
echo "Installation terminée. Démarrage : bash infra/brev/run-production.sh"
