# Sama Agent — Worker (Python)

Worker IA + API (D1) : `FastAPI` (contrat C §62) + agent `livekit-agents` (boucle vocale réelle ADR-004/005).

## Modules
| Module | Rôle |
|---|---|
| `serve/fastapi.py` | API publique : `/api/intent`, `/api/journey`, `/api/documents/analyze`, `/api/evidence/{req}`, `/api/voice/token`, `/healthz` |
| `agent/engines/journey_engine.py` | Moteur **déterministe** du parcours (ADR-006) — règles pures, agnostique langue |
| `agent/engines/intent_engine.py` | Intent via GLM-5.3-Flash (NVIDIA) + fallback mots-clés (mode deterministic) |
| `agent/engines/document_engine.py` | Vision réelle (multimodal) des documents fournis (G11 : jamais « validé par l'IA ») |
| `agent/engines/evidence_engine.py` | Lookup preuves `data/evidence` (C §66) |
| `agent/stt/asr_kiriku.py` | ASR wolof **Kiriku-Wolof-ASR** (ADR-002) — GPU Brev |
| `agent/tts/tts_xtts.py` | TTS wolof **xTTS-v2-wolof** (ADR-003) — GPU Brev, attribution GalsenAI |
| `agent/voice/main.py` | Agent LiveKit : micro → ASR → Intent → Journey → TTS → track voix |

## Lancer (jour J, nœud GPU Brev)
```bash
export SAMA_MODE=live            # deterministic = Version B (sans LLM/audio)
export NVIDIA_BASE_URL=... NVIDIA_API_KEY=... NVIDIA_MODEL=glm-5.3-flash
export LIVEKIT_URL=ws://localhost:7880 LIVEKIT_API_KEY=... LIVEKIT_API_SECRET=...
cd services/worker && pip install -e .
python -m serve.fastapi          # API :8000
python -m agent.voice.main       # agent voix (LiveKit)
```

## Tests
```bash
pytest tests/   # matrice C §53 (14 cas) + robustesse B §43–48 + contrats
```

## Note honnête
Python n'est pas installé sur la machine de dev (Windows) — ce code est écrit pour le nœud GPU Brev.
Aucun état n'est simulé : en `deterministic`, un document non analysé renvoie `NEEDS_REVIEW`.