# Brev — déploiement jour J (27/09/2026)

Document opérationnel du nœud GPU Brev. Il fait foi pour l'exécution du scénario démo.

## Services déployés

| Service | Image / process | Port | Notes |
|---|---|---|---|
| API worker (FastAPI) | `services/worker` (`agent.api.fastapi`) | 8000 | `SAMA_MODE=live` au jour J |
| Agent voix (LiveKit) | `services/worker` (`agent.voice.main`) | — | se connecte au SFU LiveKit |
| SFU LiveKit | `livekit-server` auto-hébergé | 7880 (WS) / 7881 (TCP/UDP) | transport audio temps réel |

Le worker (API + agent voix) et le SFU LiveKit vivent sur le nœud Brev demande ; le front (`apps/web`)
peut être servi par la même machine (Brev expose le port 3000) ou par Vercel/Netlify.

## Variables d'environnement (secrets Brev — jamais dans le dépôt)

```
SAMA_MODE=live
SAMA_DEVICE=cuda
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_API_KEY=<secret Brev>
NVIDIA_MODEL=glm-5.3-flash
KIRIKU_MODEL=AIHubSN/Kiriku-Wolof-ASR
XTTS_MODEL=galsenai/xTTS-v2-wolof
XTTS_SPEAKER=<wav de référence 6 s (voix démo)>
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=<secret>
LIVEKIT_API_SECRET=<secret>
LIVEKIT_ROOM=sama-demo
ALLOWED_ORIGINS=http://localhost:3000,https://<domaine-brev>
```

## Modèles GPU à valider le jour J (directive point B0 : catalogue réel, VRAM)

Pas de supposition : les modèles sont re-vérifiés la veille dans le catalogue NVIDIA/Brev réel.
Budget VRAM attendu : **Kiriku ≈ 10 Go** (fine-tune whisper-large-v2, fp16) + **xTTS-v2-wolof ≈ 2 Go** — à confirmer sur le nœud.

| Modèle | Source (ADR) | Rôle | VRAM estimée |
|---|---|---|---|
| Kiriku-Wolof-ASR | ADR-002 (AIHubSN) | ASR wolof | ~10 Go |
| GLM-5.3-Flash | NVIDIA catalogue | intent + JSON | — (API) |
| xTTS-v2-wolof | ADR-003 (GalsenAI) | TTS wolof | ~2 Go |

Attribution **GalsenAI** audible à la démo (licence xTTS/Coqui — voir `LICENCES.md`).

## Ordre de démarrage

```bash
# 1. SFU LiveKit (transports audio)
livekit-server --config livekit.yaml &

# 2. API worker
cd services/worker && pip install -e . && python -m agent.api.fastapi &

# 3. Agent voix (boucle vocale réelle)
python -m agent.voice.main &
```

## Vérifications post-démarrage (aucune ne doit être « visuelle seule »)

- `GET /healthz` → `{"status":"ok","mode":"live"}`
- `POST /api/voice/token` → JWT valide (> 20 caractères)
- Micro → Kiriku (wolof) → `/api/intent` → `/api/journey` → xTTS → haut-parleur : **barge-in réel** (le micro interrompt la voix IA)
- `node scripts/latency.mjs 20` — mesures RÉELLES de la chaîne (point 17), pas la cible 1,2–1,5 s
- `tests/matrix/test_validation_points.py` verts sur le nœud

## Ports et accès

- Exposer 7880/7881 en UDP pour le SFU (sinon latence/perte — à vérifier sur la config Brev).
- CORS : ajouter l'origine du front déployé dans `ALLOWED_ORIGINS`.