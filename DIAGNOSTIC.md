# DIAGNOSTIC COMPLET — Sama Agent

**Assistant administratif vocal temps réel (wolof) — GOMYCODE × NVIDIA**
**Date du diagnostic :** 26/09/2026 · **Commit audité :** `ac50570` · **Mode de vérification :** exécution réelle (API démarrée, tests lancés, routes interrogées, imports testés)

> **Règle appliquée.** Aucune fonctionnalité n'est déclarée fonctionnelle sur la base de son existence visuelle. Chaque affirmation de ce rapport est soit **prouvée par exécution**, soit **marquée NOT VERIFIED**.

---

## 01 — EXECUTIVE SUMMARY

### 1.1 Verdict en une phrase

**Le moteur de parcours, la persistance et le contrat d'API sont réels, testés et fonctionnels. La chaîne vocale — qui est le cœur produit déclaré — n'a jamais été exécutée une seule fois et ne peut pas l'être : elle ne s'importe pas.**

### 1.2 Niveau réel du produit

| Couche | État réel | Preuve |
|---|---|---|
| Design system / UI | **Solide** | Tokens complets `globals.css` + mapping Tailwind, `tsc` 0 erreur |
| Parcours déterministe (moteur) | **Fonctionnel, testé** | 53/53 pytest, matrices d'état vérifiées |
| Persistance + reprise dossier | **Fonctionnelle** | POST → GET reprise : état identique, vérifié en live |
| API FastAPI (7 routes) | **Fonctionnelle** | Toutes requêtées, codes corrects sur chemins nominaux |
| Chaîne vocale (STT→LLM→TTS) | **Non fonctionnelle, jamais exécutée** | `ModuleNotFoundError: numpy` à l'import |
| Conversations (historique) | **Inexistante** | 0 endpoint, 0 table lue, 0 table écrite |
| Mémoire long terme | **Inexistante** | localStorage seul, agent ne peut pas la lire |
| Tool calling | **Mort en production** | `chat_with_tools` : 0 site d'appel |
| Streaming | **Inexistant** | non-streaming assumé, 35–49 s à chaud |

### 1.3 Ce qui est réellement opérationnel

1. **Le moteur de Journey** — machine à états pure, priorité `NEEDS_REVIEW > PROVIDE_DOCUMENT`, `completion` toujours dérivée, `PROVIDE_PHOTOS`correctement prioritaire quand `photos` manque. C'est le meilleur morceau du projet.
2. **La persistance serveur** — 16 tables SQLAlchemy, isolation par `user_id` sur `POST`/`GET /api/journey`,seed idempotent, événements d'audit.
3. **Le contrat partagé** — `enums.json` source unique, parité TS ≡ Python ≡ JSON vérifiée, Zod `.strict()` des deux côtés.
4. **L'honnêteté du degrade mode** — en `deterministic`, l'analyse documentaire renvoie `NEEDS_REVIEW` + `requiresHumanReview: true` au lieu de certifier. C'est une vraie qualité produit, rare et volontaire.
5. **Le design system** — jeu de tokens complet (couleur, rayon, z-index, motion), thème dark glass, `:focus-visible` visible, accessibilité AA déclarée et tenue.

### 1.4 Les 5 blocages qui décident de tout

| # | Blocage | Preuve |
|---|---|---|
| **B1** | **L'agent vocal ne s'importe pas.** `agent/voice/main.py` échoue ligne 23. `numpy`, `torch`, `transformers`, `livekit.rtc`, `livekit.agents`, `TTS` : tous absents du venv. | exécution directe |
| **B2** | **La capture audio serveur est un pont cassé.** `main.py:179 await pub.track()` → `TypeError` (c'est une propriété). `main.py:181 track.on("audio_frame")` → `AttributeError` (`Track` n'est pas un `EventEmitter`). | lecture + API docs |
| **B3** | **`KeyError` à chaque tour de parole.** `journey_id = os.getenv("LIVEKIT_ROOM", "sama-demo")` mais le seul JSON de procédure est `driving_license_new.json`. Exception non rattrapée dans `asyncio.create_task` → l'agent ne parle jamais, silencieusement. | lecture + `data/procedures/` |
| **B4** | **La clarification est cassée en production.** `process_intent.py` utilise `enums.Language.FR` ; l'enum définit `fr`/`wo` en minuscules → `AttributeError` → **HTTP 503 vérifié en live**. Le chemin voix force `language=None` → clarification inatteignable en vocal. | **exécution live** |
| **B5** | **Les E2E Playwright sont cassés et le disent "passed".** Les 4 routes visées (`/comprehension`, `/journey/*`, `/dossier/*`, `/evidence/*`) **retournent 404**. `test-results/.last-run.json` affiche `"status": "passed"` — artefact périmé d'avant le commit `ac50570`. | **HTTP 200/404 sur serveur réel** |

### 1.5 Ce qui doit être conservé / repris / refait

- **Conserver tel quel** : `agent/domain/` (moteur, actions, evidence), `agent/infrastructure/db/`, `packages/shared/`, `globals.css` + `tailwind.config.ts`, la discipline Zod, le mode `deterministic` honnête.
- **Reprendre** : toute la couche `agent/voice/` (réécriture du transport audio), `agent/tools/` (recâblage), `process_intent.py` (bug enum), `e2e/` (routes).
- **Refaire** : le modèle de données conversation/mémoire (il n'existe pas — ce n'est pas un bug, c'est une absence), l'orchestration agent.

---

## 02 — PRODUCT INVENTORY

### 2.1 Routes réelles (24 pages + 16 alias)

**Espace public** — `/` landing · `/login` · `/signup` · `/forgot-password` · `/reset-password` · `/verify-email` · `/limits` · `/auth` *(duplique `/login`, ne redirige pas)*

**Espace connecté** — `/app/home` · `/app/voice` · `/app/comprehension` · `/app/journey/[id]` · `/app/dossier/[id]` · `/app/evidence/[requirement]` · `/app/chats` · `/app/chats/[conversationId]` · `/app/memory` · `/app/memory/[memoryId]` · `/app/files` · `/app/actions` · `/app/search` · `/app/you` · `/app/you/[section]` · `/app/next-action` *(orphelin, 0 lien entrant)*

**Onboarding** — `/onboarding` (wizard 5 étapes) + 4 sous-routes alias

**Alias de compatibilité** — `/home` `/voice` `/chat/[id]` `/memory` `/memory/[id]` `/files` `/files/[id]` `/search` `/actions` `/settings` `/settings/[section]` `/you` `/help` `/welcome` `/onboarding/{voice,permissions,memory,first-conversation}`

> **Manque :** aucun alias pour `/comprehension`, `/journey`, `/dossier`, `/evidence` — c'est exactement ce qui casse les E2E.

### 2.2 Backend

7 routes FastAPI, 1 processus séparé pour l'agent LiveKit (non fusionnable : `cli.run_app()` bloque à l'import).

### 2.3 Composants

`VoiceCore` (orb), `PhaseHeader`, `CancelButton` — utilisés. **Morts :** `VoiceButton`, `VoiceVisualizer`, tout `components/chat/` (`MessageBubble`, `ThinkingOverlay`), `ErrorState`, `StatusPill`, `Thinking`, `Sheet`, `Drawer`, `AuthBusy`, `Skeleton`.

### 2.4 Contenu

**1 procédure** · **1 intent** · **3 exigences** · **4 étapes** · **1 source** · **3 fichiers de preuve** · **4 prompts** (lekind `response` déclaré mais **le dossier n'existe pas**).

---

## 03 — FEATURE STATUS MATRIX

Légende : **L1** VISUAL · **L2** INTERACTIVE · **L3** FUNCTIONAL · **L4** INTEGRATED · **L5** PRODUCTION READY

| Module | Fonction | UI | Logic | Backend | API | Data | IA | Test | Niveau | Statut | Blocage |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|---|---|
| Parcours | Moteur Journey | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ | **L4** | 🟢 FUNCTIONAL | — |
| Parcours | Persistance + reprise | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ | **L4** | 🟢 FUNCTIONAL | — |
| Parcours | Isolation par utilisateur | ✅ | ✅ | ✅ | ✅ | 🟡 | — | 🟡 | **L3** | 🟡 PARTIAL | parcours orphelin claimed par n'importe qui |
| Contrat | Parité TS≡Py≡JSON | — | ✅ | — | — | — | — | ✅ | **L4** | 🟢 FUNCTIONAL | — |
| Auth | Sign up / login Supabase | ✅ | ✅ | — | ✅ | 🟡 | — | 🟡 | **L4** | 🟡 PARTIAL | flux vérification e-mail incomplet |
| Auth | Vérif. JWT worker (live) | — | ✅ | ✅ | ✅ | ✅ | — | ✅ | **L4** | 🟢 FUNCTIONAL | — |
| Auth | Auth en `deterministic` | — | ❌ | ❌ | ❌ | ❌ | — | 🟡 | **L1** | 🔴 MISSING | header Authorization ignoré |
| Auth | Google OAuth | — | — | — | — | — | — | — | **L0** | 🔴 MISSING | provider désactivé, non câblé |
| Onboarding | Collecte + persistance | ✅ | 🟡 | ❌ | ❌ | 🟡 | ❌ | ❌ | **L2** | 🟠 MOCK | flag localStorage, rien n'est réutilisé |
| Accueil | Saisie texte → intent | ✅ | 🟡 | ✅ | ✅ | — | 🟡 | 🟡 | **L3** | 🔵 IMPROVEMENT | **résultat LLM jeté à la poubelle** |
| Accueil | bouton vocal | ✅ | ✅ | — | 🔴 | — | 🔴 | ❌ | **L2** | 🔴 BLOCKED | B1+B2 |
| **Voix** | Micro → permission | ✅ | ✅ | — | — | — | — | ❌ | **L2** | 🟡 PARTIAL | OK, mais VAD sans COOP/COEP |
| **Voix** | VAD Silero segmentation | — | ✅ | — | — | — | — | ❌ | **L2** | 🔵 IMPROVEMENT | **segment audio jeté** |
| **Voix** | LiveKit client (connect/mic) | — | ✅ | — | ✅ | — | — | ❌ | **L2** | 🟡 PARTIAL | jamais testé contre un SFU |
| **Voix** | **Capture audio serveur** | — | ❌ | ❌ | ❌ | — | — | ❌ | **L0** | 🔴 BLOCKED | **B2 — pont cassé** |
| **Voix** | **STT Kiriku wolof** | — | ❌ | ❌ | ❌ | — | ❌ | ❌ | **L0** | 🔴 BLOCKED | **B1 — torch/transformers absents** |
| **Voix** | **LLM (NVIDIA GLM)** | — | 🟡 | ✅ | ✅ | — | 🟡 | ❌ | **L3** | 🟡 PARTIAL | 35–49 s, 0 retry, leak httpx |
| **Voix** | **TTS xTTS wolof** | — | ❌ | ❌ | ❌ | — | ❌ | ❌ | **L0** | 🔴 BLOCKED | **B1 — `TTS` non installé** |
| **Voix** | **Interruption (barge-in)** | ✅ | ❌ | 🟡 | 🌷 | — | — | ❌ | **L1** | 🔴 BLOCKED | **bloquant event loop** |
| **Voix** | Machine à états | ✅ | ❌ | — | — | — | — | ❌ | **L1** | 🟠 MOCK | 5/13 états, `speaking` deviné |
| Conversation | Chat texte | ✅ | 🟡 | ✅ | ✅ | ❌ | 🟡 | ❌ | **L3** | 🟡 PARTIAL | réponse = template, pas agent |
| Conversation | **Historique** | 🟡 | ❌ | ❌ | ❌ | ❌ | — | ❌ | **L1** | 🔴 MISSING | **0 endpoint, 1 ligne max** |
| Conversation | Renommer / supprimer | ❌ | ❌ | ❌ | ❌ | ❌ | — | ❌ | **L0** | 🔴 MISSING | non implémenté |
| Conversation | Persistance transcript | ❌ | ❌ | ❌ | ❌ | ❌ | — | ❌ | **L0** | 🔴 MISSING | store non persisté, non cloisonné |
| Mémoire | Stockage | ✅ | ✅ | ❌ | ❌ | 🟡 | — | ❌ | **L2** | 🟠 MOCK | localStorage seul |
| Mémoire | **Récupération par l'agent** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | **L0** | 🔴 MISSING | **architecturalement impossible** |
| Document | Analyse (deterministic) | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ | **L4** | 🟢 FUNCTIONAL | honnête `NEEDS_REVIEW` |
| Document | Analyse (live, vision) | ✅ | 🟡 | ✅ | ✅ | 🟡 | 🟡 | ❌ | **L3** | 🟡 PARTIAL | 2 appels, 0 retry, PII en clair |
| Preuve | `/api/evidence` | ✅ | ✅ | ✅ | ✅ | 🟡 | — | ✅ | **L4** | 🟢 FUNCTIONAL | 3 fichiers JSON, 1 source |
| Agent | Orchestration | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | **L0** | 🔴 MISSING | **pas d'orchestrateur** |
| Agent | **Tool calling** | — | 🟡 | 🟡 | ❌ | 🟡 | ❌ | 🟡 | **L1** | 🔴 MISSING | `chat_with_tools` : 0 appel |
| Agent | Mémoire long terme | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | **L0** | 🔴 MISSING | — |
| Profil | `/app/you` | ✅ | 🟡 | ❌ | ❌ | ❌ | — | ❌ | **L2** | 🟠 MOCK | lecture seule + logout réel |
| Réglages | Persistance des settings | 🟡 | ❌ | ❌ | ❌ | 🟡 | — | ❌ | **L1** | 🔴 MISSING | aucun stockage serveur |
| Design | Design system | ✅ | ✅ | — | — | — | — | ❌ | **L3** | 🟢 FUNCTIONAL | — |
| Identité | Logo / assets | ❌ | — | — | — | — | — | — | **L0** | 🔴 MISSING | **`public/` inexistant, 0 asset** |
| Qualité | pytest | — | — | — | — | — | — | ✅ | — | 🟢 53/53 | — |
| Qualité | vitest | — | — | — | — | — | — | ✅ | — | 🟢 15/15 | — |
| Qualité | tsc | — | — | — | — | — | — | ✅ | — | 🟢 0 err. | — |
| Qualité | **E2E** | — | — | — | — | — | — | ❌ | — | 🔴 **CASSÉ** | **B5 — 404, "passed" périmé** |
| Qualité | **Tests vocaux** | — | — | — | — | — | — | ❌ | — | 🔴 **AUCUN** | 0 test sur 100 % de la voix |
| Sécurité | Headers HTTP | — | ✅ | — | — | — | — | ❌ | **L2** | 🔵 IMPROVEMENT | **pas de CSP**, pas de COOP/COEP |
| Sécurité | Scan de secrets | — | 🟡 | — | — | — | — | ❌ | **L1** | 🔴 MISSING | **ne voit que la racine** |
| Perf. | Latence API | — | ✅ | — | — | — | — | — | **L3** | 🟢 OK | 5–54 ms |
| Perf. | Latence vocale | — | ❌ | ❌ | ❌ | — | ❌ | ❌ | **L0** | ⚫ **NOT VERIFIED** | chaîne non exécutable |

---

## 04 — SCREEN-BY-SCREEN AUDIT

### 04.1 `/` — Landing
**Ce qui existe** : hero, `VoiceCore` décoratif, 3 étapes.
**Ce qui fonctionne** : redirection authentifiée, CTA.
**Ce qui est simulé** : `const STEPS = [...]` littéral codé en dur ; `<VoiceCore state="idle" interactive={false}>` sur une fausse surface d'écoute ; emojis 🎤🧭📁 comme icônes.
**Ce qui manque** : état d'erreur, état de chargement, favicon.
**Dépendances** : `useAuth()`, `isOnboardingDone()` (localStorage).
**Preuves** : `apps/web/src/app/(public)/page.tsx:15-31`, `:66`.

### 04.2 `/login` · `/signup` · `/auth`
**Ce qui fonctionne** : Supabase réel (`signInWithPassword`, `signUp`), messages d'erreur FR, `loading`.
**Ce qui est simulé** : rien — c'est honnête.
**Ce qui manque / bug** :
- `usePostAuthRedirect` redirige **instanément** vers `/app/home` si Supabase n'est pas configuré → **tout l'écran d'auth est inobservable** en dev par défaut.
- `/auth` **ne redirige pas** : il rend `LoginForm`, doublon de `/login`.
- `signUp` ne passe **aucun `emailRedirectTo`** ; **aucune page ne lit `?code=`** ni n'appelle `exchangeCodeForSession` → **le flux de vérification e-mail est incomplet**.
- `verify-email` est un **avis statique** : il ne peut jamais valider quoi que ce soit.
- HTML invalide : `<Button><Link/></Button>` (`forms.tsx:381`).
- `AuthBusy` existe et n'est **jamais importé** — c'est pourtant le composant dont `/reset-password` a besoin.
- `/reset-password` ne vérifie pas qu'une session de récupération existe ; il ne gère ni lien expiré ni `#error=access_denied` ; il ne fonctionne que grâce au `detectSessionInUrl` implicite de `supabase-js` (**dépendance non documentée à une valeur par défaut de librairie sur tout le chemin de sécurité**).
**Preuves** : `forms.tsx:26-36`, `:135`, `:297`, `:381`, `:394` ; `supabase.ts:105-133`.

### 04.3 `/onboarding`
**Ce qui fonctionne** : wizard 5 étapes, demande de micro **réelle** (`getUserMedia`), état granted/denied honnête, alternative texte.
**Ce qui est simulé** : `<VoiceCore state="listening" interactive={false}>` à l'étape 1 — **un état d'écoute fabriqué sur un écran sans micro, sans VAD, sans LiveKit**.
**Ce qui manque** : **aucune information collectée n'est persistée ni réutilisée.** Le seul flag est `localStorage["sama:onboarding"]="done"`. L'étape « voix » ne teste rien. L'étape « mémoire » n'écrit rien. L'étape « préférences » n'existe pas.
**Verdict** : L1/L2. Collecte cosmétique.

### 04.4 `/app/home` — Accueil ⚠️ **finding le plus grave côté produit**
**Ce qui fonctionne** : `POST /api/intent` réel, states loading/erreur, parcours en cours depuis le store.
**Ce qui est simulé / gaspillé** : **le résultat de l'analyse est entièrement jeté.**
```tsx
// apps/web/src/app/app/home/page.tsx:23-25
const intent = useIntentMutation(() => { router.push("/app/comprehension"); });
```
`intent`, `action`, `confidence`, `needsClarification`, `clarificationQuestion` : **aucun n'est lu**. La saisie libre de l'utilisateur part vers le LLM, est classifiée, **puis abandonnée** ; l'écran suivant hardcode la procédure.
> **Conséquence produit : la saisie libre est décorative. Tout utilisateur aboutit au permis de conduire, quelle que soit sa demande.**

**Autres points** : le message d'erreur dit « Réessayez. » **sans bouton** ; titre de carte = `journey.procedureId` brut → l'utilisateur voit « Parcours driving_license_new » ; aucun état vide.
**Preuves** : `home/page.tsx:23-25`, `:85-89`, `:101`.

### 04.5 `/app/voice` ⚠️
**Ce qui est réellement réel** : `getUserMedia`, VAD Silero v5 (API correcte), `AudioContext` + `AnalyserNode` réel, `LiveKit` `room.connect` + `setMicrophoneEnabled(true)`, `POST /api/voice/token`, durée de segment réelle.
**Ce qui est simulé** : **« Je vous écoute… » est un littéral codé en dur**, sous un commentaire affirmant « n'affiche que du texte RÉEL côté client ». C'est faux : aucun `RoomEvent.DataReceived` n'existe dans le dépôt, donc **aucune transcription ne peut jamais arriver**.
**Ce qui est cassé** : le segment audio VAD est utilisé **uniquement pour `segment.length`** puis jeté ; le serveur ignore `durationMs`. **La seule chose qui traverse la frontière client→serveur pour la parole utilisateur est la chaîne `"user_segment"`.**
**Machine à états** : 5 phases sur 13 déclarées. `speaking` est **deviné** depuis `TrackSubscribed` (donc *avant* le premier sample, et jamais annulé si TTS ne produit rien). `thinking` est entré à la fin du VAD et **n'est jamais quitté** par un événement serveur. `interrupted` est **inatteignable**.
**Fuites** : 2 `AudioContext` jamais `close()`, jamais `detach()`, microstreams dupliqués sur « Réessayer », `onError` déclaré mais **jamais appelé** par `VoiceRoom`.
**Preuves** : `voice/page.tsx:99`, `:103-110`, `:177-182` ; `livekit.ts:11`, `:29`, `:55-59` ; `stores.ts:133-162` ; `schemas/index.ts:140-157`.

### 04.6 `/app/chats` — Historique ⚠️
**Ce qui existe** : une liste.
**Ce qui est réel** : **rien.** La source est un seul objet Zustand :
```tsx
// apps/web/src/app/app/chats/page.tsx:14
const journey = useJourneyStore((s) => s.response);
```
- **0 endpoint** `/conversations`, `/messages`, `/sessions`.
- La liste rend **au maximum 1 ligne, pour toujours**.
- Titre fabriqué : `` `Parcours ${journey.procedureId}` ``.
- **Renommer : absent. Supprimer : absent. Pagination : impossible. Recherche : absent.**
- Le sous-titre « les données viennent du serveur (reprise par dossier) » est **un demi-mensonge** : cet écran ne fait **aucun appel réseau**.
- Les tables `sessions` et `agent_messages` **existent dans le schéma et ne sont jamais écrites ni lues**. La couche de données de l'historique a été *conçue puis jamais construite*.
- `ListItem` rend un `<a href>` brut → **rechargement complet** de page.

### 04.7 `/app/chats/[conversationId]`
**Ce qui fonctionne** : `GET /api/journey/:id` réel, skeleton, état d'erreur honnête, bouton copier réel (clipboard + toast), modale de mémorisation.
**Ce qui est simulé** : la **réponse de l'agent est un template codé en dur** :
```tsx
// apps/web/src/app/app/chats/[conversationId]/page.tsx:43-46
"J'ai besoin d'un détail pour comprendre votre demande."
"Votre demande est comprise."
```
> **Il n'y a pas d'agent conversationnel ici. `/api/intent` est un classifieur par mots-clés à un coup.**

**Ce qui manque** :
- **Pas de streaming** (`fetch` + `json()`), le pendant visuel est un `<div>J'analyse…</div>` statique au lieu du vrai composant `ThinkingDots`.
- **Pas de retry** (`retry: 0` global), message d'erreur sans bouton.
- **Historique non persisté** : `useChatStore` n'a pas de `persist` → **un rechargement de page efface la transcription**.
- **Non cloisonné** : `conversationId` n'est pas dans la clé du store. Naviguer de `/chats/A` vers `/chats/B` **affiche les messages de A sous l'en-tête de B**. `clear()` n'est **jamais appelé**.
- La branche `r.transcript` réémet le transcript à l'utilisateur, mais le worker renvoie `transcript: null` → **le template « confiance X % » est ce que l'utilisateur voit réellement**.

### 04.8 `/app/memory` ⚠️
- **Onglet `preferences`** : **100 % texte codé en dur.** Ne lit rien — **pas même la langue choisie dans les réglages.**
- **Onglet `important`** : **100 % texte codé en dur.** Le lien vers `/limits` est même conditionné à l'existence d'un dossier (couplage arbitraire).
- **Onglet `souvenirs`** : localStorage. Suppression réelle + modale destructive (bien fait).
- **Onglet `pieces`** : sessionStorage + API evidence.
- **Il n'existe aucun endpoint mémoire, aucune table mémoire, aucun champ mémoire dans le schéma de requête.** `intentRequestSchema` et `journeyRequestSchema` sont `.strict()` → **il est mathématiquement impossible d'envoyer une mémoire au backend.**
- **L'agent ne peut jamais la relire.** Le toast « Mémorisé dans la mémoire. » décrit un stockage, pas une utilité.
- **Durabilité inversée** : mémoire = `localStorage` (survit), dossier = **`sessionStorage`** (détruit à la fermeture de l'onglet). **Fermer l'onglet détruit tout le dossier.**
- Bug : la `Modal` est toujours montée → `document.body.style.overflow = "hidden"` au montage.
- Le **même** `title="Rien de mémorisé pour l'instant"` sert pour deux onglets sémantiquement différents.

### 04.9 `/app/you` et `/app/you/[section]`
- `logout` **réel** (Supabase).
- **Aucun champ éditable.** Tout est en lecture seule.
- `agent` promet « Style de réponse, **affichage** » → **le thème n'existe nulle part**. Promesse non tenue.
- `voice` promet « Réponses orales, **sons** » → **aucun code audio d'UI n'existe**.
- « Revoir l'onboarding » appelle `resetOnboarding()` **sans naviguer** → action à moitié faite.
- `help` est **injoignable** depuis l'UI (`/limits` est lié à la place) ; et il redirige vers `/app/comprehension` qui **hardcode le permis**.

### 04.10 `/app/comprehension` ⚠️
```tsx
// page.tsx:17-18
const PROCEDURE_ID = "driving_license_new";
// page.tsx:20-36
const REQUIREMENTS = [ {n:"1",title:"Pièce d'identité",desc:"…"}, … ];
```
**Doublon manuel** de `data/procedures/driving_license_new.json`, et les **`desc` sont inventées** — elles n'existent pas dans les données sources. Seul le `POST /api/journey` est réel.
→ **C'est un cul-de-sac pour toute demande sauf « permis de conduire ».** Le backend le confirme : `INTENT = ["driving_license"]`, un seul membre.

### 04.11 `/app/journey/[id]` — **meilleur flux de données du projet** ✅
Reprise `GET` d'abord, `POST` seulement en 404, et **le fallback ré-embarque les analyses connues** pour ne pas les effacer. Soigné et correct.
**Bug visible** : `STATUS_TONE` a des clés en minuscules alors que l'enum est en MAJUSCULES → `STATUS_TONE[status]` vaut toujours `undefined` → **tous les statuts s'affichent en badge gris neutre** et l'utilisateur lit littéralement **`NEEDS DOCUMENT`** dans l'UI.

### 04.12 `/app/dossier/[id]`, `/app/files`, `/app/actions`, `/app/search`
- `dossier` : même bon pattern, mais `useJourneyStore()` sans sélecteur (re-render à chaque mutation) + risque de boucle sur 404 persistant.
- `files` : l'état vide ignore `pending` → **les 3 pièces attendues sont masquées** quand on n'a rien uploadé. `fileTone`/`statusTone` existent en **3 copies** verbatim. Branches `REJECTED`/`INVALID` **mortes** (absents de l'enum).
- `actions` : `if (!ready) return null` → **page blanche**. Doublonne `NextActionCard`. Ré-écrit des libellés FR que la doctrine du projet interdit ailleurs.
- `search` : **ignore la mémoire** alors que l'overlay `Cmd+K` la cherche — **périmètre de recherche incohérent**.

### 04.13 `/app/evidence/[requirement]`
**L'écran le plus réellement fonctionnel** : `GET /api/evidence` réel, upload multipart réel, `POST /api/documents/analyze` réel, avertissement honnête « Analyse automatique : pas de certification officielle. »
**Bugs** : `analyze.mutateAsync` **sans try/catch** → rejet de promesse non géré ; le message 413 du worker n'est **jamais affiché** ; `journeyId` hardcodé sur `driving_license_new` en repli.

### 04.14 `/app/next-action`
**Orphelin total** — 0 lien entrant. Duplique `NextActionCard`. Aucun loading/error/empty.

---

## 05 — VOICE SYSTEM AUDIT

### 05.1 Verdict

> 🔴 **La chaîne vocale n'a jamais été exécutée. Elle ne peut pas l'être.** Le code serveur est inimportable, et même une fois les dépendances installées, deux appels API sont syntaxiquement invalides.

### 05.2 Chaîne — état réel étape par étape

| Étape | Attendu | Réel | Preuve |
|---|---|---|---|
| Permission micro | `getUserMedia` | ✅ **fonctionnel** | `voice/page.tsx:61` |
| Capture client | `setMicrophoneEnabled(true)` | ✅ code réel, **jamais testé contre un SFU** | `livekit.ts:43` |
| VAD | Silero v5 | ✅ **correct**, mais **segment jeté** | `vad.ts:24-27` |
| Envoi segment | audio 16 kHz | 🔴 **seulement `{type, segmentId, durationMs}`** | `voice/page.tsx:107` |
| Token | JWT LiveKit | ✅ **fonctionnel** (316 car., signé localement) | `fastapi.py:229-252` |
| Room | SFU | 🔴 **aucun SFU dans le dépôt** : pas de `docker-compose`, pas de `livekit.yaml`, pas de `RoomServiceClient.create_room`, pas de `agent_name`. Le token accorde `room_join` **mais pas `roomCreate`**, et **personne ne crée la room.** | recherche repo : 0 hit |
| Réception audio agent | `pub.track` + events | 🔴 **`TypeError` + `AttributeError`** | `main.py:179,181` |
| STT | Kiriku wolof | 🔴 **inatteignable** (buffer vide → `return` en `main.py:148`) | `main.py:144-149` |
| LLM | GLM NVIDIA | 🟡 code réel, **inatteignable depuis la voix** | `main.py:159` |
| Journey | moteur | 🔴 **`KeyError: procédure inconnue : sama-demo`** | `main.py:116` |
| TTS | xTTS wolof | 🔴 **inatteignable** + `TTS` non installé | `main.py:123` |
| Publication audio | track LiveKit | 🟡 code correct (24 kHz, WAV 100 ms) — **jamais atteint** | `main.py:121-142` |
| Interruption | `stop_event` | 🟡 **mécanisme réel et correct** — mais inatteignable (§05.5) | `main.py:134,169` |
| Restitution client | transcript + phase | 🔴 **aucun `DataReceived` handler n'existe** | `livekit.ts:29,38` |

### 05.3 STT — détail
- **Ce n'est pas une API HTTP** : c'est un modèle Whisper **local in-process** (`transformers` pipeline), `AIHubSN/Kiriku-Wolof-ASR`, `language="wolof"` forcé.
- **Audio attendu** : PCM s16le mono WAV 16 kHz.
- **Défaut de ré-échantillonnage** : `samples[::3]` en dur avec 48 kHz codé en dur, `frame.sample_rate` ignoré, **aucun filtre anti-replik**. Le commentaire dit honnêtement « décimation simple, phase 1 ».
- **Aucun mock, aucun repli** : en `deterministic` → `KirikuUnavailableError` (échec dur).
- **Gestion d'erreur** : `except Exception: log.error(...)` → **aucun retour au client, aucun event, aucun reset de phase.** Le client reste sur « J'analyse… » **indéfiniment** (aucun timeout côté client).

### 05.4 TTS — détail
- Local in-process, `galsenai/xTTS-v2-wolof`. **`TTS` est un extra optionnel non installé par la procédure documentée.**
- **Ce n'est pas du streaming** : la phrase entière est synthétisée en WAV mémoire, puis ré-publiée frame par frame.
- **Une track LiveKit est publiée/dépubliée par réponse** → le client voit `TrackSubscribed` puis `TrackUnsubscribed` à chaque tour.
- **Aucun try/except** autour de `play_text` (contrairement à l'ASR) → une erreur TTS tue la task asyncio, silence total.
- **Défaut de langue** : `dialogue.formulate` renvoie du **français codé en dur** (4 phrases possibles) vers un **modèle TTS wolof-only**. Le code dit « la voix wolof reformule — jour J xTTS » : **ce passage n'existe pas dans le code.**

### 05.5 Interruption (barge-in) — analyse exacte
**Le mécanisme serveur est bon et fonctionnerait** : `barge_in` → `stop_event.set()` → boucle `capture_frame` cassée → `source.close()` → `unpublish_track`. Granularité 100 ms.

**Mais il est structurellement inatteignable :**
1. **`handle_segment` bloque la boucle d'événements.** `asr_kiriku.transcribe()` (sync), `voice_turn()` (httpx sync, timeout **600 s**), `tts_xtts.synthesize()` (sync) pinning l'event loop pendant **secondes à minutes**. `room.on("data_received", ...)` est un callback **synchrone sur cette même boucle** → **un `barge_in` émis pendant « thinking » est mis en file et traité après que la réponse est entièrement synthétisée.** Le barge-in est impossible pendant le traitement.
2. **Pas d'AEC, pas de half-duplex.** Le micro reste publié en permanence pendant que l'agent parle → le VAD (branché sur le flux micro brut) peut détecter **la voix de l'agent** → auto-interruption.
3. **L'UI ne montre jamais « Interrompu »** : le phase saute directement à `listening`. L'état `interrupted` et son label sont **inatteignables**.
4. **`stopAgentAudio()` est un no-op partiel** : `pause()` ok, mais `removeAttribute("src")` ne fait rien (LiveKit attache via `srcObject`) et le `track` n'est jamais `detach()`é.

### 05.6 Latences vocales
**Non mesurables.** La chaîne n'est pas exécutable. Les seules données disponibles sont des commentaire de code (LLM 35–49 s à chaud, ~300 s à froid, streaming 183 s **rejeté au profit du non-streaming**). **Statut : ⚫ NOT VERIFIED / 🔴 BLOCKED.** Aucune mesure réelle n'existe.

---

## 06 — AI / AGENT ARCHITECTURE

### 06.1 Architecture réelle (et non cible)

```
Utilisateur
   ↓  getUserMedia  ✅
   ↓  Silero VAD    ✅
   ↓  ✂️  segment 16 kHz CALCULÉ PUIS JETÉ         🔴
   ↓  DataChannel: {"type":"user_segment", segmentId, durationMs}  🔴
   ↓  ✂️  serveur ignore segmentId ET durationMs  🔴
   ↓  buffer audio : JAMAIS PEUPLÉ (pont cassé)    🔴
   ↓  Kiriku ASR    ✖ inatteignable                🔴
   ↓  GLM (intent)  ✖ inatteignable                🔴
   ↓  Journey       ✖ KeyError "sama-demo"         🔴
   ↓  xTTS          ✖ inatteignable                🔴
   ↓  track LiveKit ✖ jamais atteint               🔴
   ↓  UI orbe       ⚠️ 5 phases, 2 devinées, 1 littéral  🟠
```

### 06.2 Niveau réel : **Niveau simple, et même pas complètement**

Le modèle **« agent »** décrit dans le README et le compte-rendu :
```
Input → Context → Memory → Orchestrator → Reasoning/Tool selection
      → Tools → Model → Response → Action
```
**Réellement implémenté :** `Input` (partiellement) → ~~Context~~ → ~~Memory~~ → ~~Orchestrator~~ → ~~Reasoning~~ → ~~Tools~~ → ~~Model~~ → `Response` (4 templates) → ~~Action~~.

**Il n'y a pas d'orchestrateur.** `agent/application/orchestration/agent_orchestrator.py` existe mais n'est **jamais appelé** par la voix ni par l'API. La « conversation » est une **table de correspondance à 4 états** (`dialogue.py:15-21`).

### 06.3 Tool calling — mort
`GlmLlm.chat_with_tools` (`glm.py:134-162`) : **0 site d'appel.** `agent/tools/dispatcher.py`, `definitions.py` et les 4 exécuteurs ne sont atteints **que par les tests**. Aucun use case, aucune route, aucun handler vocal ne les appelle. Conséquence : **la table `tool_calls` est toujours vide en production.** De plus `chat_with_tools` n'a **aucun try/except** (contrairement à `_chat`) → une 504 remonte une `httpx.HTTPStatusError` brute.

### 06.4 Système prompt & contexte
- 4 prompts sur disque : `system/v1`, `intent/v2`, `document/v1`, `extract/v1`. Le kind `response` est **déclaré dans `ALLOWED_KINDS` mais le dossier n'existe pas** → `FileNotFoundError` si appelé.
- **Aucun contexte de conversation** n'est transmis. `process_voice_turn` envoie `IntentRequest(transcript=text, language=None)` — **sans historique, sans mémoire, sans dossier**. `language=None` en dur : **la langue n'est jamais détectée** malgré un ASR wolof-only.
- **Timeout 600 s, zéro retry, zéro fallback** dans la chaîne live.

---

## 07 — BACKEND / API AUDIT

### 07.1 Cartographie

```
Next.js (browser)
  ├─ Supabase Auth (direct, HTTPS)              ✅ réel
  └─ Bearer JWT ──► FastAPI :8000
                     ├─ /healthz                    🟡 public, divulgue le mode
                     ├─ POST /api/intent            🟢
                     ├─ POST /api/journey           🟢
                     ├─ GET  /api/journey/{id}      🟢
                     ├─ POST /api/documents/analyze 🟢
                     ├─ GET  /api/evidence/{req}    🟢
                     └─ POST /api/voice/token       🟢 (JWT local, 0 réseau)

LiveKit SFU  🔴 ABSENT DU DÉPÔT
  ▲
  └── Worker voix (processus 2, NON fusionnable : cli.run_app() bloque à l'import)
        Kiriku ASR  🔴 / GLM  🔴 / Journey  🔴 / xTTS  🔴
```

### 07.2 Vérification live (mode `deterministic`, API démarrée)

| Test | Résultat |
|---|---|
| `GET /healthz` | `200 {"status":"ok","mode":"deterministic"}` ✅ |
| `POST /api/intent` « permis de conduire » | `200` `intent=driving_license` `confidence=0.6` ✅ |
| `POST /api/intent` « passeport » **sans `language`** | **`503`** 🔴 ← **bug B4** |
| `POST /api/intent` « passeport » **avec `language:"fr"`** | `200 needsClarification=true confidence=0.0` 🟡 |
| `POST /api/journey` | `200 NEEDS_DOCUMENT` `0/3` 3 exigences ✅ |
| `GET /api/journey/{id}` | `200` état identique ✅ **persistance prouvée** |
| `POST /api/documents/analyze` (vrai PNG multipart) | `200 NEEDS_REVIEW requiresHumanReview=true` ✅ **honnête** |
| `GET /api/journey/{id}` après analyse | `200 NEEDS_REVIEW` `REVIEW_DOCUMENT` ✅ **le moteur a.progressé** |
| `GET /api/evidence/identity` | `200` + source + limites ✅ |
| `GET /api/evidence/inconnu` | `404` ✅ |
| `POST /api/voice/token` | `200` JWT 316 car., `url=ws://localhost:7880` 🟡 |
| `POST /api/journey` `procedureId` inconnu | `404` 🟡 (FK déguisée, cf. 07.5) |

### 07.3 `SAMA_MODE` — le mode par défaut est `live`, pas `deterministic`

**Aucun chargement de `.env` n'existe dans le dépôt** : ni `dotenv`, ni `load_dotenv`, ni `pydantic-settings.BaseSettings` (alors que `pydantic-settings` est une dépendance déclarée et jamais importée). Donc `.env.example:5` (`SAMA_MODE=deterministic`) **n'a aucun effet**.

```python
# agent/mode.py:16
m = os.getenv("SAMA_MODE", "live").strip().lower()   # ← défaut = "live"
```

**Conséquence** : lancer l'API sans environnement ⇒ `live` ⇒ **Supabase JWT obligatoire sur les 6 routes protégées** et appels NVIDIA tentés. Le mode documenté comme « par défaut » ne l'est pas.

**Branches nonvivantes en `deterministic`** (toutes vérifiées) :
- intent → **table de 7 mots-clés** (4 wolof jamais testés), `confidence=0.6` **littéral fabriqué**, `IntentAction.renewal` inatteignable.
- document → `NEEDS_REVIEW` codé en dur, **les octets du fichier sont lus puis jetés**, `readability=False` enregistré.
- ASR / TTS → **échec dur**.
- **rate limiting désactivé** (`fastapi.py:62-63`).
- `trace.model = "regles-c"` — **nom de modèle fabriqué** écrit dans l'observabilité.
- `db.documents.model = "deterministic"` — idem.
- identité = **constante unique** `service-deterministe` pour **tous** les appelsants ⇒ **isolation multi-utilisateur inexistante en dev**.

### 07.4 Base de données
- **SQLAlchemy 2.0 synchrone** (pas d'async), **SQLite par défaut** (`sqlite:///./var/sama.db`, chemin relatif au CWD), PostgreSQL/psycopg3 si `SAMA_DATABASE_URL` est défini.
- `create_all` + seed tournent **inconditionnellement au premier accès, y compris en production** → les migrations Alembic ne sont pas le chemin d'initialisation réel.
- **Une seule révision Alembic**, et `alembic/env.py:34` pointe par défaut vers **`var/alembic.db`, un fichier différent de `var/sama.db`** ⇒ `alembic upgrade head` migre une base que l'application n'ouvre jamais.
- Seed **insert-only** (`session.get(...) is None`) : **toute correction de `data/*.json` est silencieusement ignorée** sur une base déjà seedée.
- **8 des 16 tables ne sont jamais écrites ; 12 ne sont jamais lues.** Seules 4 sont lues : `users`, `journeys`, `journey_requirements`, `procedure_versions`.
- **Le contenu de référence vient des JSON sur disque, pas de la base** (`domain/procedures.py:22`, `domain/evidence.py:21`). Les tables `procedures`/`requirements`/`sources` sont des **décorations en écriture seule**.
- **Aucun stockage de fichiers** : `storage_key=None` toujours. Les fichiers uploadés sont **jetés**. Aucun S3/R2/Supabase-Storage dans le dépôt.
- **Prise de possession de dossier** : `if user_id and previous.user_id is None: previous.user_id = user_id` — **n'importe quel utilisateur authentifié peut réclamer un dossier orphelin.**
- **Bug mort** : `previous.status = journey.status` est assigné **avant** `if previous.status != journey.status` → condition **toujours fausse** → l'événement d'audit `NEXT_ACTION_CHANGED` **ne peut jamais être émis**.

### 07.5 Défauts d'API relevés
- `POST /api/documents/analyze` est **`async def` mais appelle une fonction synchrone** avec un LLM à timeout 600 s ⇒ **un upload bloque tout l'event loop jusqu'à 10 minutes.** C'est la route la plus coûteuse et la seule async.
- FK violations → **503/500** au lieu de 422/404.
- Message 413 **codé en dur « 10 Mo maximum »** alors que la limite est configurable.
- `IntentRequest.transcript` : `min_length=1`, **aucun `max_length`** → surface de DoS mémoire.
- `voice_token` **rejette l'identité authentifiée** (`identity = f"awa-{uuid4().hex[:8]}"`) : les logs LiveKit ne sont pas rattachables à un utilisateur, et le worker **ne sait pas qui parle**.
- `LIVEKIT_API_KEY/SECRET` **retombent silencieusement sur `devkey`/`devsecret`** ⇒ en production sans variable, le endpoint renvoie **200 avec un token signé par des identifiants publics**.
- `LIVEKIT_URL` par défaut en **`ws://`** (cleartext).
- Rate limiter = **dict en mémoire jamais purgé** (croissance non bornée, par process).
- `GlmLlm()` / `GlmVisionProvider()` construits **à chaque requête** et **jamais `close()`** ⇒ fuite de `httpx.Client`.
- `/docs` et `/openapi.json` exposés sans authentification.

---

## 08 — DESIGN / UX AUDIT

### 08.1 Ce qui est solide ✅
- **Jeu de tokens complet** dans `globals.css` (fond, 4 surfaces, 2 bordures, primary/accent-ai, success/warning/danger/error/info, 4 niveaux de texte, 8 rayons, 2 ombres, **12 z-index**, 5 durées de motion) + mapping Tailwind exhaustif. C'est du vrai design system, pas une palette.
- Thème dark glass cohérent, `.aurora`, `.text-gradient`, `.core-breath`, `.ring-pulse`, `.listenRipple`.
- **Accessibilité** : `:focus-visible` avec outline 3 px, `aria-live="polite"`, `role="alert"`, `role="status"`, `prefers-reduced-motion` respecté sur l'orb.
- Le composant `VoiceCore` est une **vraie animation à `requestAnimationFrame` lisant un `AnalyserNode`** — pas une CSS/static. C'est le meilleur composant du projet.

### 08.2 Identité visuelle

| Élément | Statut | Constat |
|---|---|---|
| Logo | 🔴 **MANQUANT** | **aucun asset binaire dans tout le front** |
| Favicon / icône PWA | 🔴 **MANQUANT** | **le dossier `apps/web/public/` n'existe pas** |
| Image OG / aperçu lien | 🔴 **MANQUANT** | aucun |
| Symbole / marque | 🟠 **TEMPORAIRE** | vert `#0dc98a` + bleu `#38bdf8` — decisiones mais non Grease |
| Représentation de l'agent | 🟠 **TEMPORAIRE** | `VoiceCore` générique, réutilisé en décoratif sur `/` et `/onboarding` |
| Avatar utilisateur | 🔴 **MANQUANT** | initiales CSS only |
| Icônes | 🟠 **PLACEHOLDER** | `icons.tsx` existe, mais **22 emojis** en première position : 🎤🧭📁💬🧠💭📬⚡⚠️✓●○› |
| Typographie | ✅ **FINAL** | Inter unique, échelle cohérente, `16px` mini |
| Couleurs | ✅ **FINAL** | jetonisées, sémantiques, testées |
| Identité sonore | 🔴 **MANQUANT** | aucun son, aucun jingle, `voice.sounds` ne lit rien |
| Voix | 🔴 **MANQUANT** | TTS inaccessible ; le canton `voice` promet « sons » inexistants |

### 08.3 Incohérences UX
- **5 écrans** affichent le slug brut `driving_license_new` comme titre lisible (« Parcours driving_license_new »).
- **Bug `STATUS_TONE`** : clés minuscules vs enum majuscules ⇒ **tous les badges de statut sont gris** et l'utilisateur lit `NEEDS DOCUMENT`.
- `/` et `/onboarding` affichent un `VoiceCore` en état d'écoute **sans aucun micro actif** ⇒ fausse promesse.
- `/app/memory` onglet « Préférences » : la langue choisie n'y apparaît pas.
- `/app/actions` et `/app/journey/[id]` **redérivent des libellés** que la doctrine du projet (`schemas/index.ts:120`) interdit ailleurs.
- `statusTone` existe en **3 copies** divergentes, avec des valeurs d'enum mortes.
- `ListItem` en `<a href>` ⇒ **rechargement complet** au lieu de la navigation client.
- `if (!ready) return null` sur `/app/actions` et `/app/memory/[id]` ⇒ **page blanche** à l'hydratation.
- Modale de suppression montée en permanence ⇒ `overflow:hidden` sur `body` dès l'arrivée sur `/app/memory`.
- Aucun `<Textarea>` n'est référencé par un label sur la page d'accueil dans le test E2E ; le placeholder est le seul guidance.
- Les messages « Réessayez. » **sans bouton** (accueil, chat, compréhension).

---

## 09 — SECURITY AUDIT

| # | Risque | Sévérité | Preuve |
|---|---|---|---|
| S1 | **Auth désactivée en `deterministic`** : le header `Authorization` est **intégralement ignoré**, même un garbage passe. Les 6 routes protégées sont **ouvertes**. Le mode documenté par défaut pour la démo. | 🔴 Critique | `auth/supabase.py:70-74` |
| S2 | **Identité unique en `deterministic`** : `SERVICE_USER_ID` pour tout le monde ⇒ **aucune isolation**, toutes les sessions locales partagent le même dossier. | 🔴 Critique | `supabase.py:24,74` |
| S3 | **`devkey`/`devsecret` en repli** dans le code de production : en prod sans variable, `/api/voice/token` renvoie **200** avec un token signé par des identifiants publics. | 🔴 Critique | `fastapi.py:233-234` |
| S4 | **Le scan de secrets est structurellement incapable** de détecter un `.env` en dehors de la racine, **et** son motif exige des valeurs **entre guillemets** (incompatible avec le format `.env`). `apps/web/.env.local` n'est donc **pas** détectable. | 🔴 Critique | `check-secrets.mjs:19,26-32` |
| S5 | **`apps/web/.env.local` sur disque** avec l'URL du **vrai projet Supabase** (`jpssesfekqrczmryqyni`) + clé publiable. Gitignoré, mais l'identifiant de projet est exposé. | 🟠 Élevé | `apps/web/.env.local:3-4` |
| S6 | **Secret HMAC en dur** dans un test commité. | 🟡 Moyen | `tests/matrix/test_auth.py:20` |
| S7 | **Prise de possession de dossier orphelin** par tout utilisateur authentifié. | 🟠 Élevé | `repositories.py:78-81` |
| S8 | **Divulgation d'état de configuration** : `detail=str(exc)` renvoie `"SUPABASE_JWT_SECRET non configuré"` dans le 401. `/healthz` publie le mode. `/docs` ouvert. | 🟡 Moyen | `supabase.py:81`, `fastapi.py:118` |
| S9 | **Aucune CSP** alors que le commentaire du fichier annonce « CSP complet ». **Aucun COOP/COEP** ⇒ WASM single-thread et **le VAD ne peut pas initialiser sans accès à un CDN**. | 🟠 Élevé | `next.config.ts:4-24` |
| S10 | **PII envoyée en clair à un tiers** : l'upload encode le fichier **en base64 dans une data-URL** et l'envoie à NVIDIA. Jusqu'à 10 Mo de **pièces d'identité / certificats médicaux**. Aucun consentement, aucune occultation, aucune épinglage de région. | 🔴 Critique | `vision/glm.py:48,52-55` |
| S11 | **`ws://` par défaut** pour le transport audio. | 🟠 Élevé | `fastapi.py:73` |
| S12 | Pas de vérification `iss` / `role` / `typ` sur le JWT. | 🟡 Moyen | `supabase.py:42-65` |
| S13 | Le **processus vocal n'a aucune authentification** — jamais de `require_user`. Quiconque atteint le SFU avec un token valide est accepté. | 🟠 Élevé | `voice/main.py` |
| S14 | Transcription vocale + documents personnels traités sans chiffrement au repos, sans TTL, sans purge. | 🟡 Moyen | global |
| S15 | **Aucune séparation dev/staging/prod** : un seul `SAMA_MODE`, une seule URL DB, aucun garde-fou. Pas de CI, pas de Docker, pas de manifeste de déploiement. | 🟠 Élevé | repo |

---

## 10 — PERFORMANCE AUDIT

### 10.1 Mesures réelles (API `deterministic`, exécutées)

| Mesure | Valeur |
|---|---|
| `GET /healthz` | **5,2 ms** |
| `POST /api/intent` (1er, chargement) | **449,5 ms** |
| `POST /api/intent` (suivant) | **5,4 ms** |
| `POST /api/journey` | **54,0 ms** |
| `GET /api/journey/{id}` | **~5 ms** |
| `POST /api/documents/analyze` (mode det.) | **~50 ms** (aucun modèle appelé) |
| `pytest tests -q` (53 tests) | **15,59 s** |
| `tsc --noEmit` | **0 erreur** |
| `vitest run` (15 tests) | **4,17 s** |

### 10.2 Latences IA (chiffres du code, non re-mesurés)
- LLM GLM : **35–49 s à chaud**, jusqu'à **~300 s à froid** (commentaire `glm.py:26-40`).
- Streaming **rejeté** : mesuré à 183 s contre 35–49 s en non-streaming. **Décision assumée et documentée** — c'est un choix, pas un oubli.
- Timeout configuré : **600 s**. Retry : **aucun**.

### 10.3 Latences vocales
**⚫ NON MESURÉES — 🔴 NON MESURABLES.** La chaîne ne s'exécute pas. **Il n'existe aucune mesure ASR/LLM-vocal/TTS dans ce dépôt.**

### 10.4 Problmes de performance
1. **🔴 `POST /api/documents/analyze` bloque l'event loop** (async def + appel synchrone + timeout 600 s) ⇒ **tous les autres clients sont bloqués pendant l'analyse d'un document.**
2. **🔴 La boucle vocale bloque l'event loop** sur ASR + LLM + TTS ⇒ barge-in impossible, et le worker ne peut pas traiter d'autres rooms.
3. **🟠 Le streaming LLM est désactivé** ⇒ 35–49 s de silence avant le premier token. Pour une expérience vocale, c'est rédhibitoire.
4. **🟠 LLM sans reuse de connexion** : `GlmLlm()` par requête, `close()` jamais appelé.
5. **🟠 VAD single-thread** (pas de COOP/COEP) + **modèle ONNX chargé depuis un CDN à l'exécution** ⇒ cold start réseau et **voix indisponible hors ligne**.
6. **🟡 SQLite par défaut en dev** ⇒ pas de concurrence.
7. **🟡 Rate limiter non borné** en mémoire.
8. **🟡 `sessionStorage` pour le dossier** ⇒ rechargement de page = rechargement serveur.

---

## 11 — TECHNICAL DEBT

### 11.1 Code mort / non câblé (vérifié par recherche de références)

| Élément | Emplacement |
|---|---|
| `chat_with_tools` — **0 appel** | `llm/glm.py:134-162` |
| `agent/tools/*` (dispatcher, definitions, 4 exécuteurs) — **tests seulement** | `services/worker/agent/tools/` |
| `execute_tool` → `save_tool_call` ⇒ **`tool_calls` toujours vide en prod** | `repositories.py` |
| `agent_orchestrator.py` — **jamais appelé** | `application/orchestration/` |
| `entrypoint` (agent LiveKit) — **inimportable** | `voice/main.py:110` |
| `update_dossier_from_analysis` — jamais appelé | `voice/main.py:43-49` |
| `_current_journey` — jamais appelé | `voice/main.py:52-55` |
| `chat_json_multimodal` — jamais appelé | `llm/glm.py:107-115` |
| `GlmLlm.close` / `GlmVisionProvider.close` — jamais appelés | `llm/glm.py:164` · `vision/glm.py:64` |
| `load_prompt("response")` — **dossier absent** | `prompts.py:23` |
| `safeVoiceEvent` — jamais importé | `lib/voice/events.ts:7` |
| `agent_speaking` / `agent_done` — déclarés, jamais émis ni reçus | `lib/schemas/index.ts:146-157` |
| `VoiceRoomCallbacks.onError` — **jamais appelé** | `lib/voice/livekit.ts:11` |
| `SileroVad.pause/resume` — jamais appelés | `lib/voice/vad.ts:44-51` |
| `VoiceCore showTranscript`/`transcript` — jamais passés | `components/voice/VoiceCore.tsx` |
| 8 états `CoreState` sur 13 — **inatteignables** | `VoiceCore.tsx:21-30` |
| `useVoiceStore.connected/active/segmentId` — **écrits, jamais lus** | `stores.ts:136-138` |
| `useChatStore.clear` / `setPending` — jamais appelés | `stores.ts:118,130` |
| `MessageBubble`, `ThinkingOverlay` — **tout `components/chat/` est mort** | `components/chat/index.tsx` |
| `ErrorState`, `StatusPill`, `Sheet`, `Drawer`, `Thinking`, `AuthBusy`, `Skeleton` | `components/ui/*`, `auth/forms.tsx:394` |
| `VoiceButton`, `VoiceVisualizer` | `components/voice/*` |
| `Session`, `AgentMessage`, `Evidence` (tables) — jamais écrites | `db/models.py:37,45,157` |
| `data/sources/capp_karangue.json` — **jamais lu par le code** | `data/sources/` |
| `data/demo/dossier-demo.json`, `photos-missing.json` — jamais lus | `data/demo/` |

### 11.2 Hacks & architecture provisoire
- `_DOSSIERS` : dict global en mémoire, avec un commentaire qui admet « la persistance PostgreSQL arrive en Phase PERS ».
- `journey_id = os.getenv("LIVEKIT_ROOM", "sama-demo")` — **le nom de la room comme identifiant de dossier**. La voix et l'API ne peuvent donc **jamais** désigner le même dossier.
- `LIVEKIT_ROOM` unique pour **tous les utilisateurs** du vocal.
- `room.on("data_received")` enregistré **après** `ctx.connect()` ⇒ perte des messages de la fenêtre de connexion.
- `entrypoint` fait `while True: sleep(60)` : **la capture audio n'est exécutée qu'une fois**, juste après la connexion. Un client qui rejoint plus tard n'est **jamais capturé**.
- `for _ in range(0)` sur 17 routes —
- `if hasattr(livekit_api, "VideoGrants")` : branche legacy 0.x **morte** avec `livekit-api>=0.9`.
- `JobContext` annoté mais **jamais importé** — ne survit que grâce à `from __future__ import annotations`. Le fichier n'a jamais été type-checké.

### 11.3 TODOs / documentation périmée
- **README** annonce `services/livekit` (SFU auto-hébergé) → **le dossier n'existe pas**.
- **README** annonce « worker Python mono-process » → **faux, deux processus obligatoires**.
- **`infra/brev/README.md:51`** affirme que `/api/evidence/*` est exempté d'auth → **faux**, la route a bien `Depends(require_user)`.
- **`infra/brev/README.md:88`** renvoie à `livekit.yaml` → **le fichier n'est pas dans le dépôt**.
- **README + `.env.example` + `supabase.ts`** annoncent « Google OAuth » → **provider désactivé, bouton retiré**.
- **`livekit-agents>=0.6`** sans borne haute, mais le code n'utilise que des API **supprimées en 1.x** (`cli.run_app`, `entrypoint_fnc`). Un `pip install -e .` frais installe 1.x ⇒ **crash à l'import le jour J**.
- **`pydantic-settings` déclaré, jamais importé** → le `.env.example` est décoratif.
- `data/procedures/driving_license_new.json:17` auto-déclare son propre manque de fiabilité : « exigences exactes à re-vérifier contre la source CAPP avant le jour J ».

### 11.4 Duplication
`statusTone`/`fileTone` en 3 copies · `CORE_STATE_LABEL` dupliqué dans `VoiceCore` et `PhaseHeader` · `STATUS_WHY`/`STATUS_TONE` en dur dans les écrans alors que l'enum les fournit · 3 copies du `Modal`-avec-`overflow` · requirements du permis en dur dans `/app/comprehension` **en plus** du JSON.

---

## GAP ANALYSIS

> **Qu'est-ce qui sépare aujourd'hui l'application d'un produit fonctionnel ?**

### 🔴 P0 — BLOQUANT (empêche le fonctionnement principal)

| # | Gap | Pourquoi c'est bloquant |
|---|---|---|
| **P0-1** | **Rendre l'agent vocal importable et exécutable** | `numpy`/`torch`/`transformers`/`livekit.rtc`/`livekit.agents`/`TTS` absents. Le cœur produit n'a **jamais tourné**. |
| **P0-2** | **Réécrire la capture audio serveur** | `await pub.track()` et `track.on("audio_frame")` sont tous deux invalides. Zéro sample ne peut arriver au STT. Il faut `AudioStream.from_track()` (async for) ou le SDK d'agents. |
| **P0-3** | **Corriger `KeyError: sama-demo`** | Le `journey_id` vocal doit venir du token/identité, pas du nom de room. today : exception non rattrapée, l'agent ne parle jamais. |
| **P0-4** | **Corriger `enums.Language.FR` → `.fr`** | 503 vérifié en live. Le chemin de clarification est mort — **et c'est le chemin principal du chemin vocal** (`language=None`). |
| **P0-5** | **Faire transiter l'audio utilisateur** | Le segment VAD est jeté, `durationMs` ignoré. Il faut soit du **STT serveur**, soit l'envoi du PCM sur le DataChannel. |
| **P0-6** | **Débloquer le barge-in** | Sortir ASR/LLM/TTS de la boucle d'événements (`asyncio.to_thread` / workers), ajouter AEC ou half-duplex, gérer l'auto-interruption. |
| **P0-7** | **Fournir un SFU LiveKit réel** | Aucun `livekit.yaml`, aucun compose, aucun `create_room`, aucun `agent_name`, pas de grant `roomCreate`. |
| **P0-8** | **Réparer les E2E** | 4 routes sur 4 en **404**, et `.last-run.json` ment en disant « passed ». Zéro garantie de non-régression. |
| **P0-9** | **Décider et implémenter le modèle conversation** | 0 endpoint, 2 tables jamais écrites, liste d'1 élément, transcript non persisté. **Ce n'est pas un bug, c'est une absence de conception.** |
| **P0-10** | **Décider et implémenter la mémoire** | Aucun backend, aucune table, aucun champ de requête, l'agent ne peut pas la lire. |

### 🟠 P1 — CRITIQUE (avant vraie utilisation)

| # | Gap |
|---|---|
| P1-1 | **Auth réellement obligatoire** : `deterministic` ne doit pas ouvrir les 6 routes. Refuser de démarrer sans secret en `live`. |
| P1-2 | **Supprimer les replis `devkey`/`devsecret`** : échouer explicitement si les variables manquent. |
| P1-3 | **Réparer `check-secrets`** : balayer **tout l'arbre**, accepter les valeurs non guillemetées, ajouter `apps/web/*`. |
| P1-4 | **CSP + COOP/COEP** + servir le modèle VAD **en local** (plus de CDN à l'exécution). |
| P1-5 | **PII** : consentement explicite avant envoi à NVIDIA, occultation, épinglage de région. |
| P1-6 | **Rendre `POST /api/documents/analyze` non bloquante** (threadpool + timeout borné). |
| P1-7 | **Streaming LLM** — 35–49 s de silence est rédhibitoire en vocal. |
| P1-8 | **Retry + timeout + fallback** sur NVIDIA,Kiriku, xTTS. |
| P1-9 | **Propager l'erreur au client** : `agent_speaking`/`agent_done`/`agent_error` + handler `RoomEvent.DataReceived`. |
| P1-10 | **Utiliser l'identité Supabase** comme identité LiveKit (traçabilité + autorisation par room). |
| P1-11 | **Câbler le tool calling** à l'orchestrateur. |
| P1-12 | **Réparer le flux de vérification e-mail** (`emailRedirectTo` + `exchangeCodeForSession`). |
| P1-13 | **Stocker réellement les fichiers** (au lieu de `storage_key=None`). |
| P1-14 | **Garantir la cohérence DB** : retirer `create_all` du chemin prod, aligner `alembic/env.py` sur la vraie URL. |
| P1-15 | **Corriger l'audit mort** `NEXT_ACTION_CHANGED`. |

### 🟡 P2 — IMPORTANT (niveau produit)

| # | Gap |
|---|---|
| P2-1 | **Arrêter de jeter le résultat de l'analyse d'intent** sur `/app/home` — c'est le bug produit n°1. |
| P2-2 | **Supprimer le `STATUS_TONE`** et utiliser les libellés de l'enum (corrige le badge `NEEDS DOCUMENT`). |
| P2-3 | **Persister les réglages** (actuellement rien n'est stocké côté serveur). |
| P2-4 | **Rendre l'onboarding utile** : chaque information doit être persistée **et relue** par l'agent. |
| P2-5 | **Un vrai historique** : lister, renommer, supprimer, paginer, chercher, persister, cloisonner par conversation. |
| P2-6 | **Aligner la durabilité** : le dossier ne doit pas vivre en `sessionStorage`. |
| P2-7 | **Créer `apps/web/public/`** : favicon, logo, icône PWA, OG image. |
| P2-8 | **Remplacer les 22 emojis** par `icons.tsx`. |
| P2-9 | **Interdire le `VoiceCore` décoratif** sur `/` et `/onboarding`. |
| P2-10 | **Boutons « Réessayer »** partout où le texte le promet. |
| P2-11 | **Éliminer les `if (!ready) return null`** (pages blanches). |
| P2-12 | **Ajouter des retries** au client (`retry: 0` global). |
| P2-13 | **Timeout client** sur la phase `thinking`. |
| P2-14 | **Purger le code mort** (~35 items, §11.1). |
| P2-15 | **Corriger la documentation** (README, `infra/brev`, `.env.example`, Google OAuth). |
| P2-16 | **Charger réellement `.env`** (dotenv) ou supprimer `pydantic-settings` des dépendances. |
| P2-17 | **Barrer les bornes de versions** (`livekit-agents>=0.6,<1`). |
| P2-18 | **Dédoublonner** `statusTone`, `CORE_STATE_LABEL`, requirements du permis. |
| P2-19 | **Fermer la `Modal` correctement** (pas d'`overflow:hidden` permanent). |
| P2-20 | **Couvrir la voix par des tests** (actuellement 0). |

### 🔵 P3 — AMBROUSSEMENT

P3-1 Signature sonore / jingle · P3-2 Thème clair · P3-3 Thème d'affichage (promis dans `/app/you/agent`) · P3-4 « Réponses orales, sons » (promis dans `/app/you/voice`) · P3-5 Mode hors-ligne (VAD local) · P3-6 Analytics · P3-7 i18n (seul `fr` existe) · P3-8 App shell native (PWA) · P3-9 Réduction de latence LLM (modèle plus petit / quantification) · P3-10 Drag & drop de fichiers · P3-11 Notifications

---

## ROADMAP DE SORTIE

### **Phase 0 — Honnêteté des preuves (1 jour)** ⚠️ *pré-requis à tout*
1. Corriger `.last-run.json` (ou le supprimer) — il ment.
2. Marquer dans le README les fonctionnalités non fonctionnelles.
3. Créer un `docs/STATUS.md` généré par les tests, jamais écrit à la main.
> **Sans cette phase, chaque phase suivante construit sur un mensonge.**

### **Phase 1 — Stabilisation (3–5 j)**
P0-4 (bug enum) · P0-8 (E2E) · P2-2 (badge statut) · P2-11 (pages blanches) · P2-10 (boutons retry) · P1-14 (DB) · P1-15 (audit) · fixer la documentation (P2-15)
> **Objectif : un `npm run verify` vert qui veut dire quelque chose.**

### **Phase 2 — Intégration (5–8 j)**
P0-1 (dépendances) · P0-2 (capture audio) · P0-5 (transit audio) · P0-7 (SFU) · P1-9 (signalling) · P1-10 (identité) · P1-13 (stockage fichiers)
> **Objectif : un échantillon audio traverse réellement la chaîne, une fois.**

### **Phase 3 — Agent (5–8 j)**
P0-9 (modèle conversation : schéma + endpoints) · P0-10 (mémoire) · P1-11 (tools) · P1-7/8 (streaming, retry) · câbler `agent_orchestrator`
> **Objectif : `/api/chat` avec historique, mémoire et outils — pas un classifieur à un coup.**

### **Phase 4 — Voice (5–7 j)**
P0-3 (KeyError) · P0-6 (barge-in) · TTS en français **ou** wolof assumé · timeout `thinking` · états `interrupted`/`error` réels
> **Objectif : parole → transcription → agent → audio → interruption vérifiée, avec des mesures.**

### **Phase 5 — UX/UI (3–5 j)**
P2-1 (intent non jeté) · P2-4 (onboarding) · P2-5 (historique) · P2-6 (durabilité) · P2-7/8/9 (assets, icônes, orb honnête) · P2-3 (settings)

### **Phase 6 — QA (3–4 j)**
Tests vocaux automatisés · E2E contre l'arbre de routes réel · tests de non-régression sur le mode `live` · tests multi-utilisateur (isolation) · tests barge-in

### **Phase 7 — Production readiness (4–6 j)**
P1-1/2/3/4/5 (auth, secrets, CSP, PII) · monitoring + alertes (le trace middleware existe, il n'est **exploité nulle part**) · pipeline CI/CD conteneurisé · stratégie de rollback · cadre légal (CAPP, dons de données)

**Total estimé : ~30–45 jours** pour un produit réellement utilisable. **La Phase 0 + Phase 1 (≈5 jours) est le seuil minimal pour que le projet cesse de se tromper sur lui-même.**

---

## DEFINITION OF DONE — critères à appliquer

```
UI ✓  Interaction ✓  Logic ✓  Backend ✓  API ✓  Data ✓
Error handling ✓  Sécurité ✓  Tests ✓  Performance MESURÉE ✓  Production ✓
```

**Règle pour la performance :** une latence annoncée sans mesure exécutée le jour même **ne compte pas**. Les commentaires de code (35–49 s) ne sont pas des mesures.

**Règle pour l'IA :** une fonctionnalité IA n'est « terminée » que si **l'inférence a réellement tourné** avec une **clé réelle** et si la **sortie a été inspectée**. Aucun `NEEDS_REVIEW` ne doit devenir `ANALYZED` sans preuve.

---

## ANNEXE A — DEPENDENCY MAP

| Service | Fonction | Fournisseur | API dispo | Connecté | Testé | Production | Blocage |
|---|---|---|---|:-:|:-:|:-:|---|
| **Auth** | Authentification | Supabase | ✅ | ✅ | 🟡 | 🟡 | Google désactivé ; flux vérif. e-mail incomplet ; `deterministic` désactive tout |
| **LLM** | Intent + vision | NVIDIA NIM (`z-ai/glm-5.3`) | ✅ | ✅ | ❌ | ❌ | ** Jamais appelé (pas de clé)** ; 35–49 s ; 0 retry ; pas de streaming |
| **LLM vision** | Analyse document | NVIDIA (`llama-3.2-11b-vision`) + `glm-5.3-flash` | ✅ | ✅ | ❌ | ❌ | Jamais appelé ; PII en clair ; 0 retry |
| **STT** | Voix → texte | Kiriku-Wolof-ASR (local, `transformers`) | — | 🟡 | ❌ | ❌ | **Inimportable** ; pont audio cassé ; décimation sans anti-replik |
| **TTS** | Texte → voix | xTTS-v2-wolof (local, Coqui `TTS`) | — | 🟡 | ❌ | ❌ | **`TTS` non installé** ; français envoyé à un modèle wolof ; 0 try/except |
| **Transport** | WebRTC | LiveKit (client + `livekit-api`) | ✅ | 🟡 | ❌ | ❌ | **Aucun SFU** ; grants incomplets ; `stopAgentAudio` inopérant |
| **VAD** | Segmentation | Silero v5 (`@ricky0123/vad-web`) | ✅ | ✅ | ❌ | ❌ | **Segment jeté** ; modèle chargé depuis un CDN ; single-thread |
| **Database** | Données | PostgreSQL 16/17 (cible) / SQLite (défaut) | — | 🟡 | 🟡 | ❌ | 8/16 tables en écriture seule ; contenu de référence hors DB ; seed insert-only |
| **Storage** | Fichiers | **AUCUN** | ❌ | ❌ | ❌ | ❌ | `storage_key=None` ; octets jetés ; pas de S3/R2 |
| **Memories** | Mémoire long terme | **AUCUN** | ❌ | ❌ | ❌ | ❌ | **Absence totale de backend** |
| **Analytics** | Télémétrie | **AUCUN** | ❌ | 🟡 | ❌ | ❌ | Trace middleware écrit, **exploité nulle part** |
| **Monitoring** | Alertes / logs | **AUCUN** | ❌ | ❌ | ❌ | ❌ | Pas de CI, pas de conteneur, pas de manifeste |

---

## ANNEXE B — EVIDENCE PACK (reproductible)

Toutes les commandes ci-dessous ont été exécutées sur ce dépôt le 26/09/2026.

**Preuve 1 — la chaîne vocale ne s'importe pas**
```powershell
cd services\worker; python -c "import agent.voice.main"
# → ModuleNotFoundError: No module named 'numpy'   (main.py ligne 23)
# Absents : torch, transformers, livekit.rtc, livekit.agents, TTS
```

**Preuve 2 — le pont audio est invalide** (`main.py:176-184`)
```python
track = await pub.track()        # TypeError : .track est une propriété
@track.on("audio_frame")          # AttributeError : Track n'est pas un EventEmitter
```

**Preuve 3 — clarification cassée, 503 vérifié en live**
```powershell
curl -X POST localhost:8111/api/intent -d '{"transcript":"je veux un passeport"}'
# → HTTP 503
# log : intent — échec de la chaîne LLM : type object 'Language' has no attribute 'FR'
# enums.py définit : class Language(str, Enum): fr / wo   (minuscules)
```

**Preuve 4 — le moteur et la persistance sont réels**
```powershell
POST /api/journey            → 200 NEEDS_DOCUMENT 0/3
POST /api/documents/analyze  → 200 NEEDS_REVIEW requiresHumanReview=true
GET  /api/journey/{id}       → 200 NEEDS_REVIEW REVIEW_DOCUMENT   (état persisté)
```

**Preuve 5 — les E2E sont cassés** (serveur `next dev` réel)
```
200  /            200 /login       200 /app/home   200 /app/voice
404  /comprehension
404  /journey/driving_license_new
404  /dossier/driving_license_new
404  /evidence/identity
```
→ `test-results/.last-run.json` affirme `"status": "passed"` : **artefact périmé.**

**Preuve 6 — harnais verts**
```
pytest tests -q      → 53 passed (15.59s)
npx tsc --noEmit     → exit 0
npx vitest run       → 15 passed (4.17s)
```

**Preuve 7 — pas d'assets**
```powershell
Test-Path apps\web\public   → False
# 0 fichier .svg/.png/.jpg/.webp/.ico/.woff* dans apps/
```

**Preuve 8 — `.env` jamais chargé**
```powershell
Select-String -Pattern 'dotenv|BaseSettings|env_file'  → 0 résultat
# .env.example:5 (SAMA_MODE=deterministic) n'a donc aucun effet
# mode.py:16 → défaut réel = "live"
```

**Preuve 9 — le scan de secrets est aveugle**
```js
// scripts/check-secrets.mjs:26 — ne teste que la RACINE
for (const f of FORBIDDEN_FILES) { statSync(join(ROOT, f), ...) }
// → apps/web/.env.local n'est jamais inspecté
// et le motif :19 exige ["']…["'] → jamais compatible avec un .env
```

---

## ANNEXE C — BACKLOG DE CORRECTION (extrait prioritaire)

| # | Tâche | Prio | Dépend de | Équipe | Est. | Résultat attendu |
|---|---|:-:|---|---|:-:|---|
| 1 | Supprimer/corriger `test-results/.last-run.json` ; ajouter un gate E2E en CI | **P0** | — | Dev | 0,5 j | Plus d'artefact mensonger |
| 2 | Créer les alias `/comprehension` `/journey` `/dossier` `/evidence` **ou** réécrire les E2E | **P0** | 1 | Dev | 0,5 j | E2E verts et significatifs |
| 3 | `enums.Language.FR` → `.fr` (+ garde-fou de test) | **P0** | — | Back | 0,5 h | Plus de 503 sur la clarification |
| 4 | Installer la stack vocale (`livekit-agents<1`, `torch`, `transformers`, `TTS`) et figer les versions | **P0** | — | IA/Infra | 1 j | `import agent.voice.main` passe |
| 5 | Réécrire la capture audio (`AudioStream.from_track` ou SDK agents) | **P0** | 4 | Back | 1 j | Des samples arrivent au STT |
| 6 | Faire transiter l'audio utilisateur (STT serveur **ou** PCM sur DataChannel) | **P0** | 5 | Back+Front | 2 j | La parole est transcrite |
| 7 | `journey_id` depuis l'identité, pas `LIVEKIT_ROOM` | **P0** | 5 | Back | 0,5 j | Plus de `KeyError` |
| 8 | Sortir ASR/LLM/TTS de la boucle d'événements + AEC/half-duplex | **P0** | 6 | Back | 2 j | Barge-in fonctionnel |
| 9 | Déployer un SFU LiveKit (`livekit.yaml` + compose) + `create_room` + `agent_name` | **P0** | 4 | Infra | 1 j | La room existe |
| 10 | Événements serveur→client (`agent_speaking`/`agent_done`/`agent_error`) + handler | **P0** | 8 | Front+Back | 1 j | États vocaux réels |
| 11 | Modèle de données conversation (sessions/messages) + endpoints CRUD | **P0** | — | Back | 3 j | Historique réel |
| 12 | Modèle mémoire + endpoints + injection dans le prompt | **P0** | 11 | Back+IA | 3 j | L'agent se souvient |
| 13 | Refuser de démarrer en `deterministic` sur un bind non-local | **P1** | — | Back | 0,5 j | Plus d'API ouverte |
| 14 | Supprimer `devkey`/`devsecret` en repli | **P1** | — | Back | 1 h | Plus de 200 silencieux |
| 15 | Réparer `check-secrets` (tout l'arbre, `.env` non guillemeté) | **P1** | — | Dev | 0,5 j | Le scanner détecte |
| 16 | CSP + COOP/COEP + VAD servi en local | **P1** | — | Front | 1 j | Pas de CDN à l'exécution |
| 17 | Consentement + occultation PII avant NVIDIA | **P1** | — | Back+Produit | 1 j | Conformité |
| 18 | `/api/documents/analyze` non bloquante + timeout borné | **P1** | — | Back | 0,5 j | Plus de gel global |
| 19 | Streaming LLM + retry + fallback | **P1** | — | Back | 2 j | Première réponse < 3 s |
| 20 | Câbler `chat_with_tools` dans l'orchestrateur | **P1** | 11 | Back+IA | 2 j | `tool_calls` non vide |
| 21 | Flux de vérification e-mail complet | **P1** | — | Front | 1 j | Inscription wirklich |
| 22 | Stopper de jeter l'intent sur `/app/home` | **P2** | 11 | Front | 1 j | La saisie libre compte |
| 23 | Utiliser les libellés d'enum (supprimer `STATUS_TONE`) | **P2** | — | Front | 2 h | Badge correct |
| 24 | Persister les réglages | **P2** | 11 | Back+Front | 1,5 j | Réglages persistants |
| 25 | Créer `public/` (favicon, logo, PWA, OG) | **P2** | — | Design | 1 j | Identité complète |
| 26 | Remplacer les 22 emojis par `icons.tsx` | **P2** | — | Front | 1 j | Iconographie cohérente |
| 27 | Interdire le `VoiceCore` décoratif | **P2** | — | Front | 2 h | Plus de fausse écoute |
| 28 | Persisteur le dossier (plus de `sessionStorage`) | **P2** | 11 | Front | 0,5 j | Dossier durable |
| 29 | Tests vocaux automatisés | **P2** | 8 | QA | 3 j | Non-régression vocale |
| 30 | Purge du code mort (~35 items) | **P2** | — | Dev | 2 j | Base maintenable |

---

## ANNEXE D — GLOSSAIRE DES STATUTS

🟢 **FUNCTIONAL** — fonctionne de bout en bout, prouvé par exécution
🟡 **PARTIAL** — fonctionne avec des limitations connues et documentées
🟠 **MOCK / SIMULATION** — l'interface ou le comportement est simulé
🔴 **BLOCKED / MISSING** — dépendance externe ou développement manquant
🔵 **NEEDS IMPROVEMENT** — fonctionne mais pas au niveau attendu
⚫ **NOT VERIFIED** — pas assez de preuves pour conclure

L1 VISUAL · L2 INTERACTIVE · L3 FUNCTIONAL (logique réelle) · L4 INTEGRATED (APIs/données réelles) · L5 PRODUCTION READY

---

## ANNEXE E — CONSTAT FINAL

Ce dépôt est **atypique par sa rigueur documentaire** : ADR, contrats Zod stricts, parité de types vérifiée par script, 68 tests automatisés verts, un design system réellement tokenisé, et — surtout — une **discipline d'honnêteté** dans le mode dégradé (refuser de certifier un document plutôt que de fabriquer un verdict).

**Mais cette rigueur a un angle mort : elle s'est appliquée au code, pas à l'état du produit.**

Le README affirme « Aucune simulation : tout passe par la vraie chaîne. » Le compte-rendu annonce « Toutes les vérifications automatisées sont au vert » et « chaîne réelle garantie ». **Ces deux affirmations sont fausses** :

- la chaîne vocale **ne s'importe pas** ;
- les E2E **pointent tous vers des 404** tout en déclarant `passed` ;
- le tool calling **n'a aucun appelant** ;
- la mémoire **n'existe pas** ;
- l'historique **n'existe pas** ;
- Google OAuth **est désactivé** ;
- `services/livekit` **n'existe pas** ;
- le `SAMA_MODE` documenté **n'est pas celui par défaut** ;
- le `check:secrets` **ne peut pas** détecter le secret qu'il cherche.

Le moteur de parcours, lui, est solide et mérite d'être conservé tel quel.

**Le travail restant n'est pas « finir une application à 90 % ».** Le moteur et le design system sont prêts. **Mais la couche conversationnelle, la mémoire et la chaîne vocale doivent être construites, pas corrigées** — et la boucle vocale doit être réécrite. C'est un travail de **4 à 7 semaines**, pas de finition.

Tout ce qui est au-dessus a été **exécuté**, pas supposé.
