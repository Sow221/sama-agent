#!/usr/bin/env bash
# Vérifie que les variables de production sont définies — n'affiche JAMAIS leur valeur.
ENV_FILE="${SAMA_ENV_FILE:-$HOME/sama.env}"
# shellcheck disable=SC1090
[ -f "$ENV_FILE" ] && set -a && source "$ENV_FILE" && set +a
missing=0
for v in SAMA_MODE NVIDIA_BASE_URL NVIDIA_API_KEY NVIDIA_MODEL SAMA_DATABASE_URL \
         SUPABASE_URL LIVEKIT_URL LIVEKIT_API_KEY LIVEKIT_API_SECRET ALLOWED_ORIGINS; do
  if [ -z "${!v:-}" ]; then echo "  ✗ $v manquante"; missing=1
  # Valeur d'exemple restée en place (constaté : NVIDIA_API_KEY=VOTRE_CLE_… → 401 NVIDIA).
  elif printf '%s' "${!v}" | grep -qiE 'VOTRE|COLLER|YOUR[-_]|<.*>|xxxx'; then echo "  ✗ $v contient encore une valeur d'exemple"; missing=1
  else echo "  ✓ $v"; fi
done
# Signature des connexions : clés asymétriques (SUPABASE_URL suffit) ou ancien
# secret HS256 (SUPABASE_JWT_SECRET) — facultatif, seulement pour les anciens projets.
if [ -n "${SUPABASE_JWT_SECRET:-}" ]; then echo "  ✓ SUPABASE_JWT_SECRET (ancien secret HS256)"; else echo "  · SUPABASE_JWT_SECRET absent (normal si le projet utilise les nouvelles clés)"; fi
case "${SUPABASE_URL:-}" in https://*.supabase.co) ;; "") ;; *) echo "  ✗ SUPABASE_URL doit ressembler à https://<ref>.supabase.co"; missing=1;; esac
[ "${SAMA_MODE:-}" = "live" ] || { echo "  ✗ SAMA_MODE doit valoir live"; missing=1; }
case "${LIVEKIT_URL:-}" in wss://*) ;; *) echo "  ✗ LIVEKIT_URL doit commencer par wss:// (LiveKit Cloud)"; missing=1;; esac
case "${ALLOWED_ORIGINS:-}" in *https://*) ;; *) echo "  ✗ ALLOWED_ORIGINS doit contenir l'adresse https de Vercel"; missing=1;; esac
exit $missing
