/**
 * E2E — parcours principal complet (point 18 & 25), contre la VRAIE API :
 *   demande → intention → parcours → document → analyse → recalcul → preuve → prochaine action.
 * Aucune donnée pré-écrite : chaque réponse vient du worker (mode deterministic transparent).
 */
import { expect, test } from "@playwright/test";
import { resolve } from "node:path";

const JOURNEY_ID = "driving_license_new";
const TEST_DOC = resolve(
  process.cwd(),
  "../../data/demo/documents/document-clair.png"
);

test("parcours complet : demande → parcours → document → analyse → recalcul → action", async ({
  page,
}) => {
  // 1. Entrée — une demande libre en français (le wolof libre est validé au jour J).
  await page.goto("/");
  await page.getByLabel("Votre demande").fill(
    "je veux faire ma première demande de permis de conduire"
  );
  await page.getByRole("button", { name: "Commencer" }).click();
  await page.waitForURL("/comprehension");
  await expect(page.getByRole("heading", { name: "Comprendre" })).toBeVisible();

  // 2. Compréhension — 3 exigences officielles affichées (titre + description peuvent contenir le terme).
  await expect(page.getByText("Pièce d'identité").first()).toBeVisible();
  await expect(page.getByText("Certificat médical").first()).toBeVisible();
  await expect(page.getByText("Photographies").first()).toBeVisible();

  // 3. Parcours — état initial réel : 0/3 dérivé + ce qui manque + prochaine action.
  await page.getByRole("button", { name: "Voir mon parcours →" }).click();
  await page.waitForURL(`/journey/${JOURNEY_ID}`);
  await expect(page.getByRole("heading", { name: "Votre parcours" })).toBeVisible();
  await expect(page.getByText("0/3", { exact: true })).toBeVisible();
  await expect(page.getByText("Ce qui manque")).toBeVisible();
  await expect(page.getByText("Fournir un document")).toBeVisible();

  // 4. Dossier — les 3 éléments manquants.
  await page.getByRole("link", { name: "Voir mon dossier" }).first().click();
  await page.waitForURL(`/dossier/${JOURNEY_ID}`);
  await expect(page.getByRole("heading", { name: "Mon dossier" })).toBeVisible();
  await expect(page.getByText("Manquant").first()).toBeVisible();

  // 5. Preuve — source officielle + limites (C §66).
  await page.getByRole("link", { name: /Pièce d'identité/ }).click();
  await page.waitForURL(`/evidence/identity**`);
  await expect(page.getByText("Source officielle")).toBeVisible();
  await expect(page.getByText("CAPP Karangë")).toBeVisible();

  // 6. Analyse documentaire RÉELLE — fichier envoyé, résultat venant du worker (pas de navigation automatique).
  await page.getByLabel(/Fournir le document/).setInputFiles(TEST_DOC);
  await page.getByRole("button", { name: "Analyser le document" }).click();
  await expect(page.getByText(/Résultat de l'analyse/)).toBeVisible({ timeout: 30_000 });
  // En mode deterministic, un document ne peut pas être certifié : vérification humaine.
  await expect(page.getByText(/vérification humaine peut être nécessaire/i)).toBeVisible();

  // 7. Recalcul — retour au dossier : le statut du document a changé (à vérifier), jamais "validé".
  await page.getByRole("button", { name: "Retourner au dossier" }).click();
  await page.waitForURL(`/dossier/${JOURNEY_ID}`);
  await expect(page.getByText("À vérifier")).toBeVisible();

  // 8. Prochaine action recalculée par le moteur (REVIEW_DOCUMENT) + état parcours cohérent.
  await page.goto(`/journey/${JOURNEY_ID}`);
  await expect(page.getByText("Vérifier un document")).toBeVisible();
  await expect(page.getByText(/à vérifier — analyse en cours/)).toBeVisible();
});