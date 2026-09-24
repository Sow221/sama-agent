#!/usr/bin/env node
/**
 * check-terminology.mjs — point 8 : l'IA ne "valide" jamais officiellement.
 * Détecte les formulations de CERTIFICATION (affirmations), pas les dénégations
 * (« jamais validé par l'IA », « pas de certification officielle » sont autorisées).
 * Scan : UI, prompts, réponses, données. Retour 1 en cas d'affirmation interdite.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const FORBIDDEN = [
  "validé par l'ia",
  "validé par ia",
  "officiellement valide",
  "document valide",
  "certifié par",
  "certification officielle",
  "approbation officielle",
  "validé par le système",
  "VALIDATED_BY_AI",
  "officiellement approuvé",
  "garantie par l'ia",
];

// Une occurrence est tolérée si une négation apparaît juste avant (règle énoncée, pas affirmation).
const NEGATORS = /\b(jamais|pas|non|ne |n'est|interdit|proscrit|sans|aucune|aucun|éviter|≠)\b/i;

const SKIP_DIRS = new Set([
  "node_modules", ".next", ".git", ".venv", "gen", "contracts", "ui-kit-figma", "panning",
]);
const SELF = __dirname.replace(/\\/g, "/");
const FILE_RE = /\.(tsx?|jsx?|mjs|py|json|md)$/;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (FILE_RE.test(entry) && !p.replace(/\\/g, "/").startsWith(SELF)) out.push(p);
  }
  return out;
}

let failed = 0;
for (const file of walk(ROOT)) {
  const raw = readFileSync(file, "utf8");
  const lower = raw.toLowerCase();
  for (const phrase of FORBIDDEN) {
    let idx = lower.indexOf(phrase);
    while (idx !== -1) {
      // Fenêtre avant l'occurrence : si elle contient une négation → règle, pas affirmation.
      const before = lower.slice(Math.max(0, idx - 60), idx);
      if (!NEGATORS.test(before)) {
        const lineNo = raw.slice(0, idx).split("\n").length;
        console.error(`TERMINOLOGIE INTERDITE : "${phrase}" dans ${file.replace(ROOT, ".")} (ligne ${lineNo})`);
        failed++;
      }
      idx = lower.indexOf(phrase, idx + phrase.length);
    }
  }
}

if (failed > 0) {
  console.error(`\nTERMINOLOGY FAILED — ${failed} affirmation(s) de certification (point 8)`);
  process.exit(1);
}
console.log("TERMINOLOGY OK — aucune affirmation de validation officielle (point 8)");