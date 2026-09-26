#!/usr/bin/env node
/**
 * e2e-local.mjs — lance la pile RÉELLE puis joue le parcours Playwright.
 *
 * Pourquoi ce script existe
 * -------------------------
 * Les deux fichiers `apps/web/e2e/*.spec.ts` visaient des routes qui
 * n'existent pas (`/comprehension`, `/journey/x` sans le segment `/app`) et
 * `test-results/.last-run.json` annonçait « passed » alors que
 * `@playwright/test`, pourtant DÉCLARÉ dans devDependencies, n'était pas
 * installé : personne n'avait jamais exécuté cette suite. Un artefact de test
 * qui ment sur son propre statut est pire que pas d'artefact.
 *
 * Ce script rend la suite réellement exécutable et reproductible :
 *   1. démarre l'API réelle (mode `deterministic`) sur :8000 ;
 *   2. démarre Next sur :3000 ;
 *   3. joue `playwright test` ;
 *   4. arrête tout, quoi qu'il arrive.
 *
 * Honnêteté sur la couverture — à lire avant de citer « e2e vert » :
 *   - Le parcours joue en mode HARNIAIS : Supabase n'est pas configuré, donc
 *     `AuthGate` laisse passer et le worker applique son identité de service.
 *     Le chemin AUTHENTIFIÉ (session Supabase réelle, jeton Bearer) n'est donc
 *     PAS couvert par cette suite. Vitest couvre les schémas ; le jeton
 *     lui-même est vérifié côté worker par `tests/matrix/test_auth.py`.
 *   - La reconnaissance vocale n'est pas couverte : elle exige un SFU LiveKit
 *     et les dépendances `livekit-agents` / `torch`, absentes de cette machine.
 *
 * Usage :  node scripts/e2e-local.mjs
 * Sortie : code 0 si et seulement si la suite Playwright passe.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, unlinkSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const WEB = join(ROOT, "apps", "web");
const API_PORT = Number(process.env.E2E_API_PORT ?? 8000);
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 3000);
const API = `http://127.0.0.1:${API_PORT}`;
const WEB_URL = `http://127.0.0.1:${WEB_PORT}`;
const ENV_LOCAL = join(WEB, ".env.local");
const BACKUP = join(WEB, ".env.local.e2e-backup");

const children = [];

/** Termine tous les processus lancés, dans l'ordre inverse. */
function stopAll() {
  for (const child of children.reverse()) {
    if (!child.killed) {
      try {
        child.kill();
      } catch {
        /* déjà arrêté */
      }
    }
  }
}

/** Interrompt le script en laissant la machine propre. */
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    stopAll();
    process.exit(130);
  });
}

/** Laisse l'API répondre, ou abandonne après `timeoutMs`. */
async function waitForHttp(url, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      // 401/404 comptent comme « en écoute » : on teste la socket, pas la route.
      if (res.status < 500) return true;
    } catch {
      /* pas encore prête */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${label} n'a pas répondu sur ${url} après ${timeoutMs} ms`);
}

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { stdio: "inherit", shell: false, ...opts });
}

/**
 * Retire Supabase de `.env.local` le temps du run.
 *
 * `NEXT_PUBLIC_*` est figé au moment de la compilation Next : pour que le
 * harnais soit choisi, la variable doit être ABSENTE ou VIDE *avant* que le
 * serveur démarre. On met donc le fichier de côté et on le restaure à la fin,
 * quoi qu'il arrive (bloc `finally` + `process.on` ci-dessus).
 */
function useHarnessAuth() {
  if (!existsSync(ENV_LOCAL)) return () => {};
  const original = readFileSync(ENV_LOCAL, "utf8");
  const patched = original
    .split(/\r?\n/)
    .filter((line) => !/^\s*NEXT_PUBLIC_SUPABASE_(URL|ANON_KEY)\s*=/.test(line))
    .join("\n");
  writeFileSync(BACKUP, original, "utf8");
  writeFileSync(ENV_LOCAL, patched, "utf8");
  return () => {
    if (existsSync(BACKUP)) {
      writeFileSync(ENV_LOCAL, readFileSync(BACKUP, "utf8"), "utf8");
      unlinkSync(BACKUP);
      console.log("[e2e] .env.local restauré (Supabase réactivé).");
    }
  };
}

async function main() {
  // ── 0. Playwright est-il réellement installé ? ────────────────────────────
  const pwProbe = run(process.execPath, [
    join(ROOT, "node_modules", "@playwright", "test", "cli.js"),
    "--version",
  ]);
  if (pwProbe.status !== 0) {
    console.error(
      "[e2e] @playwright/test est introuvable. Lancez :\n" +
        "        npm install --workspace apps/web\n" +
        "        node node_modules/@playwright/test/cli.js install chromium"
    );
    process.exit(2);
  }

  const restoreEnv = useHarnessAuth();

  try {
    // ── 1. API réelle ──────────────────────────────────────────────────────
    const python = existsSync(join(ROOT, ".venv", "Scripts", "python.exe"))
      ? join(ROOT, ".venv", "Scripts", "python.exe")
      : "python";
    const api = spawn(
      python,
      [
        "-m",
        "uvicorn",
        "agent.api.fastapi:app",
        "--app-dir",
        join(ROOT, "services", "worker"),
        "--host",
        "127.0.0.1",
        "--port",
        String(API_PORT),
      ],
      {
        cwd: ROOT,
        env: { ...process.env, SAMA_MODE: process.env.SAMA_MODE ?? "deterministic" },
        stdio: ["ignore", "pipe", "pipe"],
      }
    );
    children.push(api);
    const apiErr = [];
    api.stderr.on("data", (d) => apiErr.push(d.toString()));
    api.stdout.on("data", (d) => {
      const s = d.toString();
      if (/Uvicorn running|Application startup complete/.test(s)) {
        console.log(`[e2e] API prête sur ${API}`);
      }
    });

    try {
      await waitForHttp(`${API}/api/intent`, 60_000, "L'API");
    } catch (err) {
      console.error(`[e2e] ${err.message}`);
      console.error(apiErr.join(""));
      process.exit(3);
    }

    // ── 2. Front réel ──────────────────────────────────────────────────────
    // Le cache de compilation est PURGÉ : Next fige les `NEXT_PUBLIC_*` à la
    // compilation. Sans cette purge, un `.next` produit avec les vraies clés
    // Supabase continue de servir `isAuthConfigured() === true` et l'e2e
    // tombe sur l'écran de connexion au lieu de l'espace protégé — l'échec
    // est alors MUET, car la page rend bien, simplement la mauvaise.
    const nextCache = join(WEB, ".next");
    if (existsSync(nextCache)) {
      rmSync(nextCache, { recursive: true, force: true });
      console.log("[e2e] cache Next purgé (.next) — les NEXT_PUBLIC_* seront relues.");
    }

    const web = spawn(process.execPath, [join(WEB, "node_modules", "next", "dist", "bin", "next"), "dev", "--port", String(WEB_PORT)], {
      cwd: WEB,
      env: {
        ...process.env,
        // Le harnais doit être choisi : `isAuthConfigured()` exige les DEUX
        // variables non vides. On les vide explicitement.
        NEXT_PUBLIC_SUPABASE_URL: "",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
        NEXT_PUBLIC_API_URL: API,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    children.push(web);
    web.stdout.on("data", (d) => {
      const s = d.toString();
      if (/Ready|ready in|Local:/.test(s)) console.log(`[e2e] Front prêt sur ${WEB_URL}`);
    });
    const webErr = [];
    web.stderr.on("data", (d) => webErr.push(d.toString()));

    try {
      await waitForHttp(WEB_URL, 180_000, "Le front");
    } catch (err) {
      console.error(`[e2e] ${err.message}`);
      console.error(webErr.join("").slice(-3000));
      process.exit(4);
    }

    // ── 3. La suite ────────────────────────────────────────────────────────
    console.log("[e2e] Lecture de la suite Playwright…");
    const pw = run(
      process.execPath,
      [join(ROOT, "node_modules", "@playwright", "test", "cli.js"), "test"],
      {
        cwd: WEB,
        env: { ...process.env, E2E_BASE_URL: WEB_URL, E2E_API_URL: API },
      }
    );
    process.exitCode = pw.status === 0 ? 0 : 1;
  } finally {
    stopAll();
    restoreEnv();
  }
}

main().catch((err) => {
  console.error("[e2e] erreur inattendue :", err);
  stopAll();
  process.exit(5);
});
