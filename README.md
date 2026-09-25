# Sama Agent

Assistant administratif vocal temps réel en **wolof** (app en français) — hackathon GOMYCODE × NVIDIA, 27/09/2026.
Le cœur produit : **dialogue vocal continu avec l'IA** (ASR Kiriku → LLM NVIDIA → Journey → TTS xTTS wolof), transport LiveKit.
**Aucune simulation : tout passe par la vraie chaîne.** (Règle fondatrice — `panning/ADR/README.md`, hors versionnement)

## Structure
```
apps/web            Front Next.js + TS + Tailwind, mobile-first — landing public (/) + /auth + espace connecté sous /app (7 écrans + Realtime Voice, BottomNav uniquement dans l'espace) — TanStack Query + Zustand (D4) ; reprise serveur (GET resume)
services/worker     API FastAPI (D1) + agent LiveKit — architecture hexagonale : agent/domain (pur) → agent/application (use_cases, dialogue, orchestration) → agent/infrastructure (llm, vision, stt, tts, prompts, db) → agent/api ; tools + dispatcher (frontière LLM ↔ système)
services/worker/agent/infrastructure/db  Persistance (référence §7.3) : SQLAlchemy 2.0, 16 tables, seed idempotent, repositories — source de vérité serveur
services/worker/alembic   Migrations de schéma (initial : 16 tables) — `python -m alembic upgrade head`
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

## Valider (backend inclus — aucune supposition)

```bash
# 1. Python local (dépendances légères, sans GPU) — voir services/worker/README.md
# 2. API réelle (Version B, mode deterministic : mêmes contrats, mêmes états, honnête) :
$env:SAMA_MODE = "deterministic"; & "\.venv\Scripts\python.exe" -m uvicorn agent.api.fastapi:app --port 8000
#    Persistance : PostgreSQL cible, SQLite local par défaut (var/sama.db) — voir services/worker/README.md ; reprise via GET /api/journey/{id}.
# 3. Batterie de validation :
& "\.venv\Scripts\python.exe" -m pytest tests -q          # moteur + contrats partagés + états/priorité
npm run verify                                            # parité + terminologie (point 8) + secrets (point 23) + Vitest
npm run smoke -w                             # smoke API scripté (point 26) — API lancée requise
node scripts/latency.mjs 20                  # latence RÉELLE (point 17), pas la cible
npx --prefix apps/web playwright test         # E2E : parcours complet + reprise de dossier (point 18/25) — front + API lancés
```

## Décisions
9 ADR validées (`panning/ADR/`) : cœur wolof · Kiriku-Wolof-ASR · xTTS-v2-wolof (GalsenAI) · LiveKit + VAD client ·
worker Python mono-process · 13 gaps contenu · types TS/Zod · écran Realtime Voice · architecture code (FastAPI direct, REST,
enums générés + parité, TanStack Query + Zustand).

## Definition of Done (directive équipe — chaque tâche)

Une tâche n'est **terminée** qu'à l'achèvement de toute la chaîne, vérifié non pas « visuellement » mais par exécution :
1. **Implémentée** — le code existe réellement (aucun mock, aucune démo en dur).
2. **Intégrée** — contrats TS ≡ Python ≡ JSON validés (parité + fixtures partagées), flux front ↔ API réel.
3. **Testée** — pytest (moteur, contrats, états, erreurs A–G), Vitest, tsc 0 erreur, `next build`, E2E Playwright.
4. **Mesurée** — latences RÉELLES enregistrées (jour J sur Brev : ASR/LLM/Journey/TTS) ; pas de cible annoncée comme mesure.
5. **Corrigée** — la cause (modèle, code, architecture, donnée, UX) est identifiée et traitée ; aucun bug connu non tracé.
6. **Reproductible** — rejouable par un autre membre de l'équipe via les commandes ci-dessus (harnais scriptés).

Le suivi point par point vit dans `panning/plan-validation-27-points.md` (hors versionnement).