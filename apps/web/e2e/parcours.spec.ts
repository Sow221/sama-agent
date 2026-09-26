/**
 * E2E — parcours principal complet, contre la VRAIE API.
 *   demande → intention → parcours → document → analyse → recalcul → preuve → prochaine action.
 *
 * Aucune donnée pré-écrite : chaque réponse vient du worker en mode
 * `deterministic`, transparent (aucun LLM, aucune simulation côté worker).
 *
 * Lancement : `npm run e2e` depuis apps/web, ou `node scripts/e2e-local.mjs`
 * depuis la racine (ce script démarre l'API et le front puis joue cette suite).
 *
 * ⚠ Cette suite joue en mode HARNIAIS (Supabase non configuré) : elle ne couvre
 * donc PAS le chemin authentifié. Voir l'en-tête de `scripts/e2e-local.mjs`.
 *
 * Historique — pourquoi cette réécriture : les routes visées n'existaient pas.
 * L'app sert le parcours sous `/app/...` ; la suite demandait `/comprehension`,
 * `/journey/x`, `/dossier/x`, `/evidence/x`. Elle visait donc des 404, et le
 * rapport `test-results/.last-run.json` annonçait « passed » alors que
 * `@playwright/test` n'était pas installé. Ces assertions n'ont jamais rien
 * vérifié : c'est précisément le genre de couverture nominale que ce lot supprime.
 */
import { expect, test } from "@playwright/test";
import { resolve } from "node:path";

const API = process.env.E2E_API_URL ?? "http://127.0.0.1:8000";
const TEST_DOC = resolve(process.cwd(), "../../data/demo/documents/document-clair.png");

test("parcours complet : demande → parcours → document → analyse → recalcul → action", async ({
  page,
  request,
}) => {
  // ── 1. Entrée : une demande libre en français ────────────────────────────
  // Le formulaire est sur /app/home (le plus landing est une vitrine).
  await page.goto("/app/home");
  await page.getByLabel("Votre demande").fill(
    "je veux faire ma première demande de permis de conduire"
  );
  await page.getByRole("button", { name: /Commencer le parcours/ }).click();

  // ── 2. Compréhension : ce que le serveur a RÉELLEMENT compris ───────────
  // L'écran affiche la transcription et l'intention reconnue. Si `/api/intent`
  // échouait ou renvoyait une clarification, ce bloc ne serait pas là.
  await page.waitForURL("**/app/comprehension");
  await expect(
    page.getByText("je veux faire ma première demande de permis de conduire")
  ).toBeVisible();
  await expect(page.getByText(/Demande reconnue/)).toBeVisible();
  await expect(page.getByText(/première demande/)).toBeVisible();

  // Les 3 exigences officielles affichées.
  await expect(page.getByText("Pièce d'identité").first()).toBeVisible();
  await expect(page.getByText("Certificat médical").first()).toBeVisible();
  await expect(page.getByText("Photographies").first()).toBeVisible();

  // Aucune question de précision : la demande a été reconnue.
  await expect(page.getByTestId("clarification")).toHaveCount(0);

  // ── 3. Parcours : état initial réel, dérivé par le moteur ───────────────
  await page.getByRole("button", { name: /Voir mon parcours/ }).click();
  await page.waitForURL(/\/app\/journey\/.+/);
  const journeyUrl = page.url();
  const journeyId = journeyUrl.slice(journeyUrl.lastIndexOf("/") + 1);
  expect(journeyId).toBeTruthy();

  await expect(page.getByRole("heading", { name: "Votre parcours" })).toBeVisible();
  // 0 sur 3 : le dossier est vide au départ. Le compteur est scindé en deux
  // éléments (chiffre + dénominateur) pour la mise en page, donc on vérifie le
  // nom accessible restitué par aria-label, pas un texte « 0/3 » qui n'existe
  // dans aucun nœud.
  const completion = page.getByTestId("completion");
  await expect(completion).toHaveAccessibleName("0 sur 3 éléments fournis");
  await expect(completion).toHaveText("0/3");
  await expect(page.getByText("Ce qui manque")).toBeVisible();
  await expect(page.getByText(/Fournir un document/)).toBeVisible();

  // La pastille d'état est un libellé FRANÇAIS, pas un identifiant de moteur.
  // Avant correction, elle affichait « NEEDS DOCUMENT » et était toujours grise
  // (la table de tons était cléée en minuscules, donc jamais trouvée).
  await expect(page.getByText("Il manque une pièce")).toBeVisible();

  // ── 4. Le serveur a bien persisté le dossier ────────────────────────────
  const resumed = await request.get(`${API}/api/journey/${journeyId}`);
  expect(resumed.status()).toBe(200);
  const serverState = await resumed.json();
  expect(serverState.completion.provided).toBe(0);
  expect(serverState.completion.required).toBe(3);
  expect(serverState.status).toBe("NEEDS_DOCUMENT");

  // ── 5. Dossier : les 3 éléments manquants ───────────────────────────────
  await page.getByRole("link", { name: /Voir mon dossier/ }).first().click();
  await page.waitForURL(new RegExp(`/app/dossier/${journeyId}`));
  await expect(page.getByRole("heading", { name: "Mon dossier" })).toBeVisible();

  // ── 6. Preuve : source officielle + limites ──────────────────────────────
  await page.getByRole("link", { name: /Pièce d'identité/ }).first().click();
  await page.waitForURL(/\/app\/evidence\/identity/);
  await expect(page.getByText("Source officielle")).toBeVisible();

  // ── 7. Analyse RÉELLE : fichier envoyé, réponse du worker ────────────────
  await page.getByLabel(/Fournir le document/).setInputFiles(TEST_DOC);
  await page.getByRole("button", { name: /Analyser le document/ }).click();
  await expect(page.getByText(/Résultat de l'analyse/)).toBeVisible({ timeout: 30_000 });
  // En deterministic, aucun document ne peut être certifié : la révision humaine
  // doit être demandée. Le dire est obligatoire ; certifier serait un mensonge.
  await expect(page.getByText(/vérification humaine peut être nécessaire/i)).toBeVisible();

  // ── 8. Recalcul : le statut passe à « à vérifier », jamais « validé » ────
  await page.getByRole("button", { name: /Retourner au dossier/ }).click();
  await page.waitForURL(new RegExp(`/app/dossier/${journeyId}`));
  await expect(page.getByText(/À vérifier/).first()).toBeVisible();

  // ── 9. Prochaine action RECALCULÉE par le moteur, lue côté serveur ──────
  await page.goto(`/app/journey/${journeyId}`);
  await expect(page.getByText(/Vérifier un document/)).toBeVisible();
  await expect(page.getByText(/Verification nécessaire|Vérification nécessaire/)).toBeVisible();

  const after = await (await request.get(`${API}/api/journey/${journeyId}`)).json();
  expect(after.completion.provided).toBe(1);
  expect(after.nextAction).toBe("REVIEW_DOCUMENT");
  expect(after.status).toBe("NEEDS_REVIEW");
});

test("demande incomprise : le serveur demande une précision, aucun dossier n'est ouvert", async ({
  page,
}) => {
  // Texte sans mot-clé de la procédure (le moteur déterministe ne reconnaît que
  // « permis », « conduire », « bëgg », « dëgg », « jay »…).
  await page.goto("/app/home");
  await page.getByLabel("Votre demande").fill("je voudrais savoir comment Faire");
  await page.getByRole("button", { name: /Commencer le parcours/ }).click();

  await page.waitForURL("**/app/comprehension");

  // Le serveur a demandé une précision : l'écran la montre et REFUSE d'ouvrir
  // un dossier. Avant correction, l'intent était jeté et un dossier de
  // première demande s'ouvrait quand même.
  const clarify = page.getByTestId("clarification");
  await expect(clarify).toBeVisible();
  await expect(clarify).toContainText(/préciser/i);
  await expect(page.getByRole("button", { name: /Voir mon parcours/ })).toHaveCount(0);

  // Aucune exigence n'est annoncée : on ne propose pas un parcours qui ne
  // correspond pas à la demande.
  await expect(page.getByText("Certificat médical")).toHaveCount(0);
});
