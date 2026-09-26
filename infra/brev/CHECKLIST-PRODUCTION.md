# Checklist production — front Vercel + worker Brev + LiveKit Cloud

À dérouler dans l'ordre. Chaque étape a un **contrôle** : on ne passe à la suivante
que s'il est vert. Aucun secret dans ce fichier.

## 0. Principe (pourquoi ces réglages)

- Le front Vercel est servi en **HTTPS** : le navigateur **refuse** d'appeler une API en
  `http://` (contenu mixte) et un LiveKit en `ws://`. Il faut donc :
  **API en `https://`** et **LiveKit en `wss://`** (LiveKit Cloud).
- Les variables `NEXT_PUBLIC_*` sont figées **au build** Vercel : après les avoir
  changées, il faut **redéployer**.

## 1. Worker sur Brev (GPU)

Variables d'environnement Brev (voir `infra/brev/README.md` pour la liste complète) :

```
SAMA_MODE=live
SAMA_DEVICE=cuda
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_API_KEY=…
NVIDIA_MODEL=z-ai/glm-5.3
SAMA_DATABASE_URL=postgresql+psycopg://…pooler.supabase.com:6543/postgres
SUPABASE_JWT_SECRET=…
LIVEKIT_URL=wss://<projet>.livekit.cloud
LIVEKIT_API_KEY=…
LIVEKIT_API_SECRET=…
ALLOWED_ORIGINS=https://<votre-app>.vercel.app
# Voix de l'agent : xTTS wolof n'a pas de poids publiés → NE PAS définir XTTS_MODEL.
# Le résolveur utilise alors Edge neural (français).
SAMA_TTS_BACKEND=edge
```

Installation puis démarrage :

```bash
cd services/worker && pip install -e .
bash infra/brev/run-production.sh      # migrations + API :8000 + agent voix (« start »)
```

**Contrôles**
- `curl https://<api-brev>/healthz` → `{"status":"ok","mode":"live"}`
- Les logs de l'agent voix montrent l'enregistrement auprès de LiveKit
  (pas l'aide de la CLI : la commande doit être `python -m agent.voice.main start`).
- Le port 8000 est exposé en **HTTPS** par Brev (lien de partage / tunnel) : c'est
  cette URL qui sert de `NEXT_PUBLIC_API_URL`.

## 2. Supabase

- Authentication → URL Configuration : **Site URL** = `https://<votre-app>.vercel.app`,
  et ajouter la même URL dans **Redirect URLs** (liens de confirmation d'e-mail et de
  réinitialisation du mot de passe).

## 3. Front sur Vercel

Project → Settings → Environment Variables (Production) :

```
NEXT_PUBLIC_API_URL=https://<api-brev>
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=…
```

Puis **Redeploy** (depuis `main`, une fois la PR fusionnée).

**Contrôles**
- Ouvrir l'app → Créer un compte → e-mail reçu → lien → connexion → onboarding → accueil.
- Outils de développement du navigateur → Réseau : les appels `/api/*` partent vers
  `https://<api-brev>` et répondent 200 (401 = session ; erreur CORS = `ALLOWED_ORIGINS`).

## 4. Préchauffage (15 min avant la démo)

Le premier appel à un modèle NVIDIA « froid » peut prendre de 50 s à 5 min. Faire un
parcours texte complet une fois (demande → parcours → analyse d'une pièce) pour
réveiller LLM et vision, puis un tour vocal pour charger Kiriku sur le GPU.

## 5. Test de la voix, en production

1. Accueil → écrire la demande → **Voir mon parcours** (la voix exige un dossier).
2. Bouton micro → autoriser le micro.
3. Parler en wolof, puis se taire. Attendu, dans l'ordre :
   « J'analyse… » → votre phrase transcrite (« Vous : … ») → réponse écrite → voix.
4. Parler pendant que l'agent répond : il doit **s'arrêter** (barge-in).
5. **Casque obligatoire** : sans casque, le micro capte la voix de l'agent et
   l'interrompt lui-même.

Si ça bloque, lire les logs de l'agent voix :

| Symptôme | Cause probable |
|---|---|
| Rien ne se passe, aucun log de room | agent voix non lancé avec `start`, ou `LIVEKIT_URL` différent entre API et agent |
| « La reconnaissance vocale est indisponible » | Kiriku : GPU/VRAM, ou téléchargement du modèle Hugging Face |
| Log « langue 'wolof' refusée » | normal : repli automatique sur la détection du modèle |
| Transcription, mais pas de voix | Edge TTS injoignable depuis Brev (réseau sortant) |
| Réponse très lente | modèle NVIDIA froid : refaire le préchauffage |

## 6. Mesures

```bash
API_URL=https://<api-brev> SUPABASE_JWT_SECRET=… node scripts/smoke-api.mjs
API_URL=https://<api-brev> node scripts/latency.mjs 20
```
