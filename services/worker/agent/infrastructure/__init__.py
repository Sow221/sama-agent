"""Infrastructure — adaptateurs et providers remplaçables (référence §5.5, model-agnostic).

  llm/glm.py        provider LLM (GLM z-ai, HTTP compatible OpenAI / NIM)
  vision/glm.py     provider Vision (multimodal) → DocumentObservation
  stt/asr_kiriku.py ASR wolof (Kiriku-Wolof-ASR, GPU Brev), chargement paresseux
  tts/tts_xtts.py   TTS wolof (xTTS-v2-wolof GalsenAI), chargement paresseux
  prompts.py        lecteur des prompts versionnés (prompts/, reproductible)
  db/               persistance PostgreSQL (SQLAlchemy) — voir Phase 2
Aucune de ces implémentations n'est visible du domaine métier.
"""