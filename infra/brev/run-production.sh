#!/usr/bin/env bash
# Démarrage production du nœud Sama Agent (jour J, Brev GPU).
#
# AUCUN secret dans ce fichier : tout vient de l'environnement Brev
# (secrets manager) — voir infra/brev/README.md pour la liste exacte.
# Prérequis : `pip install -e .` fait dans services/worker, PostgreSQL joignable.
set -euo pipefail

cd "$(dirname "$0")/../.."
cd services/worker

echo "[1/4] Migrations Alembic (schéma §7.3)"
python -m alembic upgrade head

echo "[2/4] API worker FastAPI :8000"
python -m agent.api.fastapi &
API_PID=$!

echo "[3/4] Agent voix (room ${LIVEKIT_ROOM:-sama-demo})"
python -m agent.voice.main start &
VOICE_PID=$!

echo "[4/4] Première vérification (healthz)"
sleep 2
curl -fsS http://127.0.0.1:8000/healthz && echo "" || echo "healthz: à contrôler"

echo "PID API=$API_PID · PID VOICE=$VOICE_PID — Ctrl+C pour tout arrêter."
wait