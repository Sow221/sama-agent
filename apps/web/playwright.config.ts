import { defineConfig, devices } from "@playwright/test";

/**
 * E2E Sama Agent (plan point 18 & 25) — backend RÉEL requis :
 *   API FastAPI sur http://127.0.0.1:8000 (mode deterministic ou live) — voir services/worker.
 *   Front : `npm run start -w apps/web` (ou dev) sur E2E_BASE_URL.
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