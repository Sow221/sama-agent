#!/usr/bin/env bash
# Démarrage production du nœud Sama Agent (Brev GPU).
#   bash infra/brev/run-production.sh
#
# AUCUN secret dans ce fichier : ils sont lus dans ~/sama.env (sur la machine
# Brev, voir infra/brev/sama.env.example) ou dans l'environnement.
# Prérequis : bash infra/brev/setup-brev.sh (une fois).
set -euo pipefail

cd "$(dirname "$0")/../.."
ROOT="$(pwd)"
ENV_FILE="${SAMA_ENV_FILE:-$HOME/sama.env}"
LOGS="$ROOT/var/logs"
mkdir -p "$LOGS"

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi
# shellcheck disable=SC1091
[ -f services/worker/.venv/bin/activate ] && source services/worker/.venv/bin/activate

echo "[0/5] Variables"
bash infra/brev/check-env.sh || { echo "Complétez $ENV_FILE puis relancez."; exit 1; }

cd services/worker
echo "[1/5] Migrations Alembic (schéma §7.3)"
python -m alembic upgrade head

echo "[2/5] API worker FastAPI :8000 (log : var/logs/api.log)"
python -m agent.api.fastapi >"$LOGS/api.log" 2>&1 &
API_PID=$!

echo "[3/5] Agent voix LiveKit — « start » obligatoire (log : var/logs/voice.log)"
python -m agent.voice.main start >"$LOGS/voice.log" 2>&1 &
VOICE_PID=$!

echo "[4/5] Santé de l'API"
for _ in $(seq 1 30); do
  curl -fsS http://127.0.0.1:8000/healthz >/dev/null 2>&1 && break
  sleep 1
done
curl -fsS http://127.0.0.1:8000/healthz && echo ""

TUNNEL_PID=""
if [ "${SAMA_TUNNEL:-cloudflared}" = "cloudflared" ] && command -v cloudflared >/dev/null; then
  echo "[5/5] Adresse HTTPS publique de l'API (tunnel Cloudflare, log : var/logs/tunnel.log)"
  cloudflared tunnel --no-autoupdate --url http://127.0.0.1:8000 >"$LOGS/tunnel.log" 2>&1 &
  TUNNEL_PID=$!
  URL=""
  for _ in $(seq 1 30); do
    URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOGS/tunnel.log" | head -1 || true)
    [ -n "$URL" ] && break
    sleep 1
  done
  echo ""
  echo "════════════════════════════════════════════════════════════════"
  echo " API publique : ${URL:-(voir var/logs/tunnel.log)}"
  echo " → Vercel : NEXT_PUBLIC_API_URL=${URL:-<adresse ci-dessus>}  puis Redeploy"
  echo " ⚠ Cette adresse change à chaque redémarrage du tunnel."
  echo "════════════════════════════════════════════════════════════════"
else
  echo "[5/5] Tunnel désactivé (SAMA_TUNNEL≠cloudflared) : exposez le port 8000 en HTTPS via Brev."
fi

echo "PID API=$API_PID · VOIX=$VOICE_PID · TUNNEL=${TUNNEL_PID:-—} — Ctrl+C pour tout arrêter."
echo "Suivre la voix : tail -f var/logs/voice.log"
trap 'kill $API_PID $VOICE_PID ${TUNNEL_PID:-} 2>/dev/null' INT TERM
wait
