/**
 * E2E — « reprise de dossier » volontaire (référence §7.3).
 *
 * Le navigateur démarre « à froid » (context Playwright frais = sessionStorage
 * vide, aucun cache) : TOUT l'état affiché doit venir du serveur via
 * GET /api/journey/{id}, re-dérivé par le moteur. L'état serveur est construit
 * via les mêmes endpoints réels que le produit, sans passer par l'UI.
 *
 * Lancement : `npm run e2e` depuis apps/web, ou `node scripts/e2e-local.mjs`.
 *
 * ⚠ Couvert : la reprise serveur et l'absence de re-création côté navigateur.
 * Non couvert : le chemin authentifié (mode harnais) et la voix.
 *
 * Historique : la suite visait `/journey/${JOURNEY_ID}` — route inexistante
 * (l'app sert `/app/journey/...`). Elle ne pouvait donc pas passer, et le
 * rapport `test-results/.last-run.json` annonçait « passed » sans qu'aucun
 * navigateur n'ait jamais été lancé.
 */
import { expect, test } from "@playwright/test";

const API = process.env.E2E_API_URL ?? "http://127.0.0.1:8000";
const JOURNEY_ID = "e2e-reprise-froid";

test("reprise à froid : l'état du dossier vient du serveur (GET resume), pas du navigateur", async ({
  page,
  request,
}) => {
  // ── 1. État serveur RÉEL : dossier interrompu — 2 documents analysés ─────
  // Une exigence manque encore (photos) : la completion doit rester honnête
  // (2/3 fournis) et l'action proposée doit viser CE QUI MANQUE.
  const created = await request.post(`${API}/api/journey`, {
    data: {
      journeyId: JOURNEY_ID,
      procedureId: "driving_license_new",
      documents: [
        { requirementId: "identity", status: "ANALYZED" },
        { requirementId: "medical", status: "ANALYZED" },
      ],
    },
  });
  expect(created.status()).toBe(200);
  const seeded = await created.json();
  expect(seeded.status).toBe("NEEDS_DOCUMENT");
  expect(seeded.completion.provided).toBe(2);
  expect(seeded.completion.required).toBe(3);
  expect(seeded.nextAction).toBe("PROVIDE_PHOTOS");

  // ── 2. Comptage des appels : la page DOIT lire GET resume, JAMAIS POST ───
  let resumeCalls = 0;
  let postCalls = 0;
  page.on("request", (req) => {
    if (!req.url().includes("/api/journey")) return;
    if (req.method() === "GET") resumeCalls += 1;
    else if (req.method() === "POST") postCalls += 1;
  });

  // ── 3. Ouverture dans une session vide — rien en cache navigateur ───────
  await page.goto(`/app/journey/${JOURNEY_ID}`);
  await expect(page.getByRole("heading", { name: "Votre parcours" })).toBeVisible();

  // ── 4. L'état affiché est celui du SERVEUR, re-dérivé par le moteur ────
  const completion = page.getByTestId("completion");
  await expect(completion).toHaveAccessibleName("2 sur 3 éléments fournis");
  await expect(page.getByText("Ce qui manque")).toBeVisible();
  await expect(page.getByText("Photographies", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Fournir les photographies").first()).toBeVisible();

  // La pastille d'état affiche un libellé français (« Il manque une pièce »),
  // pas l'identifiant « NEEDS_DOCUMENT ».
  await expect(page.getByText("Il manque une pièce")).toBeVisible();

  // ── 5. Preuve : la reprise est bien venue du GET, pas d'un POST local ───
  expect(resumeCalls).toBeGreaterThanOrEqual(1);
  expect(postCalls).toBe(0);
});

test("dossier inconnu : 404 affiché honnêtement, pas un dossier vide", async ({ page, request }) => {
  // Le worker répond 404 pour un identifiant qu'il ne connaît pas. L'écran doit
  // le dire ; il ne doit surtout pas fabriquer un parcours de remplacement.
  const missing = await request.get(`${API}/api/journey/e2e-jamais-cree`);
  expect(missing.status()).toBe(404);

  await page.goto("/app/journey/e2e-jamais-cree");
  await expect(page.getByTestId("error-notice")).toBeVisible();
  await expect(page.getByTestId("error-notice")).toContainText(/introuvable/i);
  // Aucune donnée inventée : ni compteur, ni exigence.
  await expect(page.getByTestId("completion")).toHaveCount(0);
});
