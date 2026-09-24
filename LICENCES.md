# Licences & attributions

Document honnête (directive point 24) : rien n'est supposé, rien n'est inventé.
Les libellés **« à vérifier »** doivent être confirmés le jour J sur la page officielle du modèle
(catalogue NVIDIA / Hugging Face) — la colonne `statut` passe alors de `à vérifier` à `confirmé`.

## Modèles (nœud GPU / API)

| Modèle | Éditeur | Licence connue | Statut | Attribution |
|---|---|---|---|---|
| Kiriku-Wolof-ASR | AIHubSN / IA Hub Sénégal | — (fiche modèle à lire) | **à vérifier** | Oui — citez AIHubSN (ADR-002) |
| xTTS-v2-wolof | GalsenAI (base Coqui xTTS-v2) | Coqui Public Model License (base) ; adaptation GalsenAI | **à vérifier** (page GalsenAI + repo Coqui) | **Obligatoire à la démo** — annonce vocale GalsenAI (ADR-003) |
| GLM-5.3-Flash | Zhipu via API NVIDIA Build | conditions d'utilisation API NVIDIA Build | à vérifier dans le contrat Build | Oui — source = NVIDIA Build |
| whisper-large-v2 | OpenAI (base du fine-tune Kiriku) | MIT (poids OpenAI) | confirmé | — |

Usage : 100 % à des fins de démonstration hackathon (non commercial). Tout déploiement
au-delà de la démo requiert la relecture des licences de chaque modèle.

## Bibliothèques et outils

| Composant | Licence | Notes |
|---|---|---|
| LiveKit (SFU + SDK) | Apache-2.0 | SFU auto-hébergé — transport audio |
| `livekit-client`, `livekit-api`, `livekit-agents` | Apache-2.0 | — |
| `@ricky0123/vad-web` | MIT | VAD Silero côté client (ADR-004) |
| Next.js / React / Tailwind / TanStack Query / Zustand / Zod / Vitest / Playwright / FastAPI / Pydantic / Uvicorn / httpx | MIT / Apache-2.0 (familles OSS) | liste exhaustive dans `package-lock.json` / `pyproject.toml` |

## Code Sama Agent

Code produit du hackathon GOMYCODE × NVIDIA — propriété de l'équipe ; non publié.
Les documents de travail (`panning/`, `ui-kit-figma/`) et les secrets **ne sont pas versionnés**.

## Données

- Sources administratives : `data/sources/capp_karangue.json` (CAPP Karangë) — le document d'origine
  est référencé dans les preuves (`data/evidence/*`), avec **limites explicites** (C §66).
- Les fichiers démo (`data/demo/*`) sont des **entrées de test**, jamais des sorties.

---

**Rappel règle fondatrice** : aucun contenu n'est « validé par l'IA ». L'IA analyse et recommande ;
la validation officielle reste du ressort du service compétent.