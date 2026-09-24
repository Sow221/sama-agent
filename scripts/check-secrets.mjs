#!/usr/bin/env node
/**
 * check-secrets.mjs — point 23 : aucun secret / donnée sensible dans le dépôt.
 * Vérifie : clés API probables, tokens JWT en dur, clés privées, fichiers .env.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const SKIP_DIRS = new Set([
  "node_modules", ".next", ".git", ".venv", "ui-kit-figma", "panning", "gen",
]);

const PATTERNS = [
  // Clés API très probables (valeurs longues) — protégées contre les faux positifs
  { re: /(sk|pk|api[_-]?key|secret|token|password)\s*[=:]\s*["'][A-Za-z0-9_\-]{16,}["']/i, what: "clé/secret probable" },
  { re: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/, what: "clé privée" },
  // JWT en dur (trois segments base64url)
  { re: /eyJ[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{10,}/, what: "JWT en dur" },
];

// Fichiers interdits dans le dépôt (même vides, au cas où ils seraient commités).
const FORBIDDEN_FILES = [".env", ".env.local", ".env.production", "credentials.json", "service-account.json"];

let failed = 0;
const fail = (m) => { console.error(`SECRET: ${m}`); failed++; };

for (const f of FORBIDDEN_FILES) {
  if (statSync(join(ROOT, f), { throwIfNoEntry: false })) fail(`fichier ${f} présent dans le dépôt`);
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

for (const file of walk(ROOT)) {
  const src = readFileSync(file, "utf8");
  for (const { re, what } of PATTERNS) {
    const m = src.match(re);
    if (m) {
      const lineNo = src.slice(0, m.index).split("\n").length;
      fail(`${what} dans ${file.replace(ROOT, ".")} (ligne ${lineNo})`);
    }
  }
}

if (failed > 0) {
  console.error(`\nSECRETS FAILED — ${failed} problème(s)`);
  process.exit(1);
}
console.log("SECRETS OK — aucun secret ni donnée sensible détecté (point 23)");