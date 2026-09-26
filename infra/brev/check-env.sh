#!/usr/bin/env bash
# Vérifie que les variables de production sont définies — n'affiche JAMAIS leur valeur.
ENV_FILE="${SAMA_ENV_FILE:-$HOME/sama.env}"
# shellcheck disable=SC1090
[ -f "$ENV_FILE" ] && set -a && source "$ENV_FILE" && set +a
missing=0
for v in SAMA_MODE NVIDIA_BASE_URL NVIDIA_API_KEY NVIDIA_MODEL SAMA_DATABASE_URL \
         SUPABASE_JWT_SECRET LIVEKIT_URL LIVEKIT_API_KEY LIVEKIT_API_SECRET ALLOWED_ORIGINS; do
  if [ -z "${!v:-}" ]; then echo "  ✗ $v manquante"; missing=1; else echo "  ✓ $v"; fi
done
[ "${SAMA_MODE:-}" = "live" ] || { echo "  ✗ SAMA_MODE doit valoir live"; missing=1; }
case "${LIVEKIT_URL:-}" in wss://*) ;; *) echo "  ✗ LIVEKIT_URL doit commencer par wss:// (LiveKit Cloud)"; missing=1;; esac
case "${ALLOWED_ORIGINS:-}" in *https://*) ;; *) echo "  ✗ ALLOWED_ORIGINS doit contenir l'adresse https de Vercel"; missing=1;; esac
exit $missing
