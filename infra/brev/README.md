# Brev — déploiement jour J (27/09/2026)

Document opérationnel du nœud GPU Brev. Il fait foi pour l'exécution du scénario démo.

## Services déployés

| Service | Image / process | Port | Notes |
|---|---|---|---|
| API worker (FastAPI) | `services/worker` (`agent.api.fastapi`) | 8000 | `SAMA_MODE=live` au jour J |
| Agent voix (LiveKit) | `services/worker` (`agent.voice.main`) | — | se connecte au SFU LiveKit |
| SFU LiveKit | **Cloud** (`wss://…livekit.cloud`) ou `livekit-server` auto-hébergé | 7880 (WS) / 7881 (TCP/UDP) | transport audio temps réel — `LIVEKIT_URL` dirige |

Le worker (API + agent voix) et le SFU LiveKit vivent sur le nœud Brev demande ; le front (`apps/web`)
peut être servi par la même machine (Brev expose le port 3000) ou par Vercel/Netlify.

## Variables d'environnement (secrets Brev — jamais dans le dépôt)

```
SAMA_MODE=live
SAMA_DEVICE=cuda
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_API_KEY=<secret Brev>
NVIDIA_MODEL=z-ai/glm-5.3
# Chaîne vision documentaire (2 temps réels, NVIDIA) :
#   1. NVIDIA_VISION_MODEL décrit le document (vision) ;
#   2. NVIDIA_EXTRACT_MODEL structure la description en JSON contraint (texte).
# Le NIM GLM démarre froid (1re inférence lente) : timeout généreux côté httpx.
NVIDIA_VISION_MODEL=meta/llama-3.2-11b-vision-instruct
NVIDIA_EXTRACT_MODEL=z-ai/glm-5.3-flash
LLM_TIMEOUT_SECS=300
# Pensez à pré-chauffer les 3 modèles avant la démo (1 appel trivial ~15 min avant),
# sinon la 1re inférence de GLM/flash peut prendre 50 s à 5 min (froid).
SAMA_DATABASE_URL=postgresql+psycopg://<user>:<secret>@<host>:5432/sama
KIRIKU_MODEL=AIHubSN/Kiriku-Wolof-ASR
XTTS_MODEL=galsenai/xTTS-v2-wolof
XTTS_SPEAKER=<wav de référence 6 s (voix démo)>
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=<secret>
LIVEKIT_API_SECRET=<secret>
LIVEKIT_ROOM=sama-demo
ALLOWED_ORIGINS=http://localhost:3000,https://<domaine-brev>
# ── Authentification (Supabase Auth — email/mot de passe + Google) ─────────
# SUPABASE_JWT_SECRET : « JWT secret » du projet Supabase (Dashboard → Settings →
# API → JWT Secret). Vérifie chaque Access Token sur le worker (HMAC-HS256).
SUPABASE_JWT_SECRET=<secret Supabase>
# Côté front (Next.js) : URL + clé ANON publique du projet Supabase.
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<clé anon Supabase>
```

> **Auth en live** : chaque route `/api/*` (sauf `/healthz` et `/api/evidence/*`) exige un
> Access Token Supabase (`Authorization: Bearer …`). L'usager est ancré en base
> (`users.id ← sub du JWT`) et les dossiers lui appartiennent (`journeys.user_id`) :
> on ne consulte/modifie jamais le dossier d'un autre. Google demande un OAuth
> Client dans Google Cloud ; sans lui, email/mot de passe fonctionne seul.

## Base de données : PostgreSQL managé (Supabase) — validé 25/09/2026

Choix retenu pour la production : **Supabase** (PostgreSQL managé, pooler Supavisor port **6543**).

- `SAMA_DATABASE_URL=postgresql+psycopg://<user>:<mot-de-passe-encodé>@<région>.pooler.supabase.com:6543/postgres`
- Un mot de passe avec caractères spéciaux doit être **encodé en URL** (`@`→`%40`, `/`→`%2F`, `:`→`%3A`, `*`→`%2A`) — le secret ne vit qu'en secret Brev.
- `python -m alembic upgrade head` **exécutée sur la base réelle** : 16 tables + `alembic_version` (révision `091542dcf94b`, PostgreSQL 17.6).
- Corrections embarquées au repo : `alembic/env.py` échappe `%` (ConfigParser Alembic interprèterait `%2F…` comme interpolation).

## Modèles GPU à valider le jour J (directive point B0 : catalogue réel, VRAM)

Pas de supposition : les modèles sont re-vérifiés la veille dans le catalogue NVIDIA/Brev réel.
Budget VRAM attendu : **Kiriku ≈ 10 Go** (fine-tune whisper-large-v2, fp16) + **xTTS-v2-wolof ≈ 2 Go** — à confirmer sur le nœud.

| Modèle | Source (ADR) | Rôle | VRAM estimée |
|---|---|---|---|
| Kiriku-Wolof-ASR | ADR-002 (AIHubSN) | ASR wolof | ~10 Go |
| GLM z-ai/glm-5.3 | NVIDIA catalogue | intent + JSON | — (API) |
| llama-3.2-11b-vision | NVIDIA catalogue | description vision documents | — (API) |
| glm-5.3-flash | NVIDIA catalogue | structuration JSON vision | — (API) |
| xTTS-v2-wolof | ADR-003 (GalsenAI) | TTS wolof | ~2 Go |

Attribution **GalsenAI** audible à la démo (licence xTTS/Coqui — voir `LICENCES.md`).

## Ordre de démarrage

Le tout-en-un versionné : `bash infra/brev/run-production.sh` (aucun secret dedans —
les variables d'environnement Brev font foi). Équivalent manuel :

```bash
# 1. SFU LiveKit (transports audio) — à sauter si LIVEKIT_URL = wss://…livekit.cloud (Cloud)
livekit-server --config livekit.yaml &

# 2. Base (PostgreSQL) — migrations restantes puis seed automatique au premier appel
cd services/worker && python -m alembic upgrade head

# 3. API worker
cd services/worker && pip install -e . && python -m agent.api.fastapi &

# 4. Agent voix (boucle vocale réelle)
python -m agent.voice.main &
```

## Vérifications post-démarrage (aucune ne doit être « visuelle seule »)

- `GET /healthz` → `{"status":"ok","mode":"live"}`
- `POST /api/voice/token` (avec `Authorization: Bearer <Access Token Supabase>`) → JWT valide (> 20 caractères)
- `POST /api/journey` **sans** jeton → `401 « authentification requise »` ; **avec** jeton → `200`
- Micro → Kiriku (wolof) → `/api/intent` → `/api/journey` → xTTS → haut-parleur : **barge-in réel** (le micro interrompt la voix IA)
- `node scripts/latency.mjs 20` — mesures RÉELLES de la chaîne (point 17), pas la cible 1,2–1,5 s
- `tests/matrix/test_validation_points.py` verts sur le nœud

Le smoke (`node scripts/smoke-api.mjs`) passe les mêmes contrats : il mine un vrai JWT
(client-side, HMAC du `SUPABASE_JWT_SECRET`) et l'envoie sur chaque route protégée —
aucune dérogation à l'authentification en live.

## Ports et accès

- Exposer 7880/7881 en UDP pour le SFU (sinon latence/perte — à vérifier sur la config Brev).
- CORS : ajouter l'origine du front déployé dans `ALLOWED_ORIGINS`.