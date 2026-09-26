/**
 * Sonde de diagnostic — NON destructive. Ne modifie aucun fichier du projet.
 *
 * But : savoir ce que le navigateur voit RÉELLEMENT pour
 * `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY`, puisque `isAuthConfigured()`
 * reste vrai en mode harnais (l'AuthGate rend alors son Spinner sans fin).
 *
 * Lancement : node scripts/probe-auth.mjs
 */
import { spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const WEB = join(ROOT, "apps", "web");
const PORT = 3999;

const children = [];
function stopAll() {
  for (const c of children.reverse()) {
    try {
      c.kill();
    } catch {
      /* déjà arrêté */
    }
  }
}
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    stopAll();
    process.exit(130);
  });
}

async function waitForHttp(url, timeoutMs, label, onTimeout) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      const r = await fetch(url);
      if (r.status < 500) return true;
    } catch {
      /* pas prêt */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  onTimeout?.();
  throw new Error(`${label} muet sur ${url}`);
}

async function main() {
  // Purge du cache Next : les NEXT_PUBLIC_* sont figés à la compilation.
  if (existsSync(join(WEB, ".next"))) rmSync(join(WEB, ".next"), { recursive: true, force: true });

  const web = spawn(
    process.execPath,
    [join(WEB, "node_modules", "next", "dist", "bin", "next"), "dev", "--port", String(PORT)],
    {
      cwd: WEB,
      // AUCUN fichier du projet n'est touché : on passe par l'environnement,
      // ce que Next lit en priorité sur les fichiers .env.
      env: {
        ...process.env,
        NEXT_PUBLIC_SUPABASE_URL: "",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
        NEXT_PUBLIC_API_URL: "http://127.0.0.1:8000",
      },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  children.push(web);
  let err = "";
  let out = "";
  web.stderr.on("data", (d) => (err += d.toString()));
  web.stdout.on("data", (d) => {
    const s = d.toString();
    out += s;
    if (/Ready|ready in|Local:/.test(s)) console.log("[probe] front prêt");
  });

  await waitForHttp(`http://127.0.0.1:${PORT}`, 180_000, "le front", () => {
    console.log("[probe] --- stdout Next ---\n" + out.slice(-2500));
    console.log("[probe] --- stderr Next ---\n" + err.slice(-2500));
  });

  // ── 1. Le HTML rendu contient-il la ref Supabase ? ────────────────────────
  const html = await (await fetch(`http://127.0.0.1:${PORT}/app/home`)).text();
  const leaked = /jpssesfekqrczmryqyni/.test(html);
  console.log(`[probe] ref Supabase dans le HTML : ${leaked ? "OUI (fuite)" : "non"}`);

  // ── 2. Les chunks JS contiennent-ils la clé ? ─────────────────────────────
  const chunks = [...html.matchAll(/\/_next\/static\/[^"']+\.js/g)].map((m) => m[0]);
  const uniq = [...new Set(chunks)];
  console.log(`[probe] ${uniq.length} chunks référencés`);
  let foundUrl = false;
  let foundAnon = false;
  for (const c of uniq) {
    const body = await (await fetch(`http://127.0.0.1:${PORT}${c}`)).text();
    if (/jpssesfekqrczmryqyni/.test(body)) foundUrl = true;
    // La clé anon est un JWT long ; on cherche un motif de clé supabase.
    if (/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/.test(body)) foundAnon = true;
  }
  console.log(`[probe] URL Supabase dans un chunk : ${foundUrl ? "OUI" : "non"}`);
  console.log(`[probe] clé type JWT dans un chunk : ${foundAnon ? "OUI" : "non"}`);

  // ── 3. Verdict ────────────────────────────────────────────────────────────
  // Si URL et clé sont absentes des chunks, `isAuthConfigured()` est faux et le
  // Spinner ne peut pas venir d'AuthGate : il faut chercher ailleurs.
  const harness = !foundUrl && !foundAnon;
  console.log(
    `[probe] VERDICT : mode ${harness ? "HARNIAIS (correct)" : "AUTH CONFIGURÉE (inattendu)"}`
  );

  stopAll();
  const noisy = err.split("\n").filter((l) => /error/i.test(l)).slice(0, 5);
  if (noisy.length) console.log(noisy.join("\n"));
}

main().catch((e) => {
  console.error("[probe]", e.message);
  stopAll();
});
