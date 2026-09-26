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

1. Console Brev → **Create Instance** → un GPU de 24 Go (L4, A10G ou L40S suffit :
   Kiriku ≈ 4–6 Go de VRAM en fp16).
2. Ouvrir un terminal sur l'instance (console Brev, ou `brev shell <instance>`), puis :

```bash
git clone https://github.com/Sow221/sama-agent.git && cd sama-agent
bash infra/brev/setup-brev.sh                  # Python, dépendances, cloudflared (une fois)
cp infra/brev/sama.env.example ~/sama.env
nano ~/sama.env                                # remplir les secrets (jamais commités)
bash infra/brev/run-production.sh              # API + agent voix + adresse HTTPS publique
```

`run-production.sh` vérifie les variables (sans les afficher), applique les migrations,
lance l'API, l'agent voix (`start`), puis un tunnel Cloudflare, et **affiche l'adresse
publique `https://….trycloudflare.com`** à reporter dans Vercel.
(Alternative : exposer le port 8000 via l'onglet **Access** de Brev — mais un tunnel
Brev protégé par authentification bloquera les appels du site Vercel.)

**Contrôles**
- `https://<adresse-publique>/healthz` dans un navigateur → `{"status":"ok","mode":"live"}`
- `tail -f var/logs/voice.log` : l'agent s'enregistre auprès de LiveKit et
  « Kiriku chargé — ASR prêt » apparaît (premier démarrage : téléchargement ~3 Go).

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
