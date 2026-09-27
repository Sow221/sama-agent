import { defineConfig, devices } from "@playwright/test";

/**
 * E2E Sama Agent (plan point 18 & 25) — backend RÉEL requis :
 *   API FastAPI sur http://127.0.0.1:8000 (mode deterministic ou live) — voir services/worker.
 *   Front construit en harnais explicite : `NEXT_PUBLIC_SAMA_HARNESS=1 npm run build -w apps/web`
 *   puis `npm run start -w apps/web` sur E2E_BASE_URL (sans cette variable, connexion obligatoire).
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});