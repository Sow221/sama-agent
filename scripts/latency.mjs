#!/usr/bin/env node
/**
 * latency.mjs — point 17 : mesure réelle, pas une cible.
 * Lance N requêtes sur les endpoints de l'API et rapporte par étape :
 *   moyenne / min / max / taux d'erreur (ASR·LLM·Journey·TTS côté voix : jour J sur Brev).
 * Usage : node scripts/latency.mjs [itérations]   (API sur API_URL, défaut http://127.0.0.1:8000)
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.API_URL ?? "http://127.0.0.1:8000";
const N = Math.max(1, Number(process.argv[2] ?? 10));
const WARM = 1;

function dur(ms) {
  return `${ms.toFixed(1)} ms`;
}

async function bench(name, fn) {
  // warm-up
  try { await fn(); } catch { /* ignore */ }
  const samples = [];
  let errors = 0;
  for (let i = 0; i < N; i++) {
    const t0 = performance.now();
    try {
      await fn();
      samples.push(performance.now() - t0);
    } catch (e) {
      errors++;
      console.error(`  ${name} #${i + 1} erreur : ${e.message}`);
    }
  }
  if (!samples.length) {
    console.log(`  ${name}: ${errors}/${N} erreurs — AUCUNE mesure`);
    return;
  }
  const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
  const min = Math.min(...samples);
  const max = Math.max(...samples);
  console.log(
    `  ${name}: avg ${dur(avg)} · min ${dur(min)} · max ${dur(max)} · erreurs ${errors}/${N}`
  );
}

console.log(`Harnais de latence — ${BASE} (${N} mesures après warm-up)`);

const jsonPost = (path, body) => fetch(`${BASE}${path}`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
}).then((r) => { if (!r.ok) throw new Error(`${path} → ${r.status}`); return r.json(); });

await bench("journey 0/3   (Journey Engine)", () =>
  jsonPost("/api/journey", { journeyId: "driving_license_new" }));
await bench("journey 2/3   (Journey Engine)", () =>
  jsonPost("/api/journey", {
    journeyId: "driving_license_new",
    documents: [
      { requirementId: "identity", status: "ANALYZED" },
      { requirementId: "medical", status: "ANALYZED" },
      { requirementId: "photos", status: "MISSING" },
    ],
  }));
await bench("intent FR     (règles/LLM)", () =>
  jsonPost("/api/intent", { transcript: "je veux un permis de conduire", language: "fr" }));
await bench("evidence     (lookup)", () => fetch(`${BASE}/api/evidence/identity`).then((r) => r.json()));

console.log("(ASR Kiriku / LLM NVIDIA / xTTS : mesurés sur Brev via la boucle vocale — jour J)");
const total = 0; // les moyennes précèdent
console.log("\nLatence totale utile : mesurée de bout en bout sur la chaîne vocale réelle (Brev), pas estimée.");