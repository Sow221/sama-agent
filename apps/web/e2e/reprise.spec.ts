/**
 * E2E — « reprise de dossier » volontaire (INT-2, plan point 25, référence §7.3).
 *
 * Le navigateur démarre « à froid » (context Playwright frais = sessionStorage vide,
 * aucun cache) : TOUT l'état affiché doit venir du serveur via GET /api/journey/{id}
 * (journeys + journey_requirements), re-dérivé par le moteur. Aucune donnée pré-écrite :
 * l'état serveur est construit via les mêmes endpoints réels que le produit.
 */
import { expect, test } from "@playwright/test";

const JOURNEY_ID = "driving_license_new";
const API = "http://127.0.0.1:8000";

test("reprise à froid : l'état du dossier vient du serveur (GET resume), pas du navigateur", async ({
  page,
  request,
}) => {
  // 1. État serveur RÉEL : dossier interrompu — 2 documents analysés, photos manquantes.
  //    Priorité du moteur (point 11) : une exigence manquante bloque → NEEDS_DOCUMENT,
  //    mais la completion reste honnête : 2/3 fournis, action « Fournir les photographies ».
  const created = await request.post(`${API}/api/journey`, {
    data: {
      journeyId: JOURNEY_ID,
      procedureId: JOURNEY_ID,
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

  // 2. Comptage des appels : la page DOIT lire GET resume et NE JAMAIS re-créer par POST.
  let resumeCalls = 0;
  let postCalls = 0;
  page.on("request", (req) => {
    if (!req.url().includes("/api/journey")) return;
    if (req.method() === "GET") resumeCalls += 1;
    else if (req.method() === "POST") postCalls += 1;
  });

  // 3. Ouverture du parcours dans une session vide — rien en cache navigateur.
  await page.goto(`/journey/${JOURNEY_ID}`);
  await expect(page.getByRole("heading", { name: "Votre parcours" })).toBeVisible();

  // 4. L'état est le MÊME qu'au serveur (re-dérivé par le moteur déterministe).
  await expect(page.getByText("2/3", { exact: true })).toBeVisible(); // 2 analysés / 3 requis
  await expect(page.getByText("Photographies", { exact: true })).toBeVisible(); // dans « Ce qui manque »
  await expect(page.getByText("— à fournir", { exact: true })).toBeVisible();
  await expect(page.getByText("Fournir les photographies")).toBeVisible(); // NextAction PROVIDE_PHOTOS

  // 5. Preuve d'origine : c'est bien la reprise serveur (GET) qui a servi, pas un POST local.
  expect(resumeCalls).toBeGreaterThanOrEqual(1);
  expect(postCalls).toBe(0);
});