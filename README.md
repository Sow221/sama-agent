# Sama Agent

Assistant administratif vocal temps réel en **wolof** (app en français) — hackathon GOMYCODE × NVIDIA, 27/09/2026.
Le cœur produit : **dialogue vocal continu avec l'IA** (ASR Kiriku → LLM NVIDIA → Journey → TTS xTTS wolof), transport LiveKit.
**Aucune simulation : tout passe par la vraie chaîne.** (Règle fondatrice — `panning/ADR/README.md`, hors versionnement)

## Structure
```
apps/web            Front Next.js + TS + Tailwind (7 écrans blueprint + Realtime Voice) — TanStack Query + Zustand (D4)
services/worker     API FastAPI (D1) + agent LiveKit : ASR Kiriku, LLM GLM-5.3-Flash, Journey déterministe, TTS xTTS wolof
services/livekit    SFU auto-hébergé (Brev)
packages/shared     enums.json = SOURCE UNIQUE (ADR-006) → enums.ts + enums.py générés (D3 + parité CI)
data/               JSON déterministe (procédures, sources, evidence) + fichiers démo = ENTRÉES réelles
panning/, ui-kit-figma/   Docs de travail — JAMAIS versionnés (gitignore)
```

## Démarrage rapide (front)
```bash
npm install
npm run gen:enums && npm run parity   # régénère + vérifie la parité TS ≡ Python ≡ JSON
npm run dev                           # apps/web → http://localhost:3000
```
Le worker Python s'exécute sur le nœud GPU Brev (voir `services/worker/README.md`) ; en local,
le front fonctionnera dès que `NEXT_PUBLIC_API_URL` pointe l'API worker.

## Décisions
9 ADR validées (`panning/ADR/`) : cœur wolof · Kiriku-Wolof-ASR · xTTS-v2-wolof (GalsenAI) · LiveKit + VAD client ·
worker Python mono-process · 13 gaps contenu · types TS/Zod · écran Realtime Voice · architecture code (FastAPI direct, REST,
enums générés + parité, TanStack Query + Zustand).