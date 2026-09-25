#!/usr/bin/env node
/**
 * smoke-api.mjs — validation scriptée et reproductible de l'API réelle (point 26) :
 * endpoints C §62, rejets de contrat (point 14), G3 (point 5), terminologie (point 8).
 * Usage : node scripts/smoke-api.mjs   (API attendue sur API_URL, défaut http://127.0.0.1:8000)
 * Sortie : PASS/FAIL par vérification ; code 1 si un échec.
 */
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.API_URL ?? "http://127.0.0.1:8000";

// ── Authentification réelle (live) ─────────────────────────────────────────
// En production (SAMA_MODE=live) chaque route protégée exige un JWT Supabase.
// Le smoke mine LE MÊME JWT que Supabase (HMAC-HS256, SUPABASE_JWT_SECRET) :
// aucune dérogation, on passe la vraie vérification du worker. En déterministe
// (local, aucun secret) l'identité de service du harnais s'applique d'elle-même.
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET ?? "";
const _b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const authHeaders = JWT_SECRET
  ? { authorization: (() => {
      const now = Math.floor(Date.now() / 1000);
      const head = _b64({ alg: "HS256", typ: "JWT" });
      const payload = _b64({ sub: "smoke-usager", email: "smoke@sama.sn", exp: now + 3600, iat: now });
      const sig = createHmac("sha256", JWT_SECRET).update(`${head}.${payload}`).digest("base64url");
      return `Bearer ${head}.${payload}.${sig}`;
    })() }
  : {};

let failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed++;
};

async function req(path, init) {
  const res = await fetch(`${BASE}${path}`, init);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* corps non-JSON */ }
  return { status: res.status, json, text };
}

// 1. Health
const health = await req("/healthz");
check("GET /healthz", health.status === 200 && health.json?.status === "ok", JSON.stringify(health.json));

// 2. Intent (mode deterministic : règles honnêtes)
const intent = await req("/api/intent", {
  method: "POST",
  headers: { "content-type": "application/json", ...authHeaders },
  body: JSON.stringify({ transcript: "je veux demander un permis de conduire", language: "fr" }),
});
check(
  "POST /api/intent (FR)",
  intent.status === 200 &&
    intent.json?.intent === "driving_license" &&
    ["new_application", "renewal", "unknown"].includes(intent.json?.action),
  JSON.stringify(intent.json)
);

// 3. Journey 2/3 — compteur TOUJOURS dérivé + label/raison moteur
const journey = await req("/api/journey", {
  method: "POST",
  headers: { "content-type": "application/json", ...authHeaders },
  body: JSON.stringify({
    journeyId: "driving_license_new",
    documents: [
      { requirementId: "identity", status: "ANALYZED" },
      { requirementId: "medical", status: "ANALYZED" },
      { requirementId: "photos", status: "MISSING" },
    ],
  }),
});
check("POST /api/journey (2/3)", journey.status === 200, JSON.stringify(journey.json));
check(
  "compteur dérivé 2/3 (G3)",
  journey.json?.completion?.provided === 2 &&
    journey.json?.completion?.required === 3 &&
    Math.abs(journey.json?.completion?.ratio - 2 / 3) < 1e-9,
  JSON.stringify(journey.json?.completion)
);
check(
  "NextAction moteur : PROVIDE_PHOTOS + label + raison",
  journey.json?.nextAction === "PROVIDE_PHOTOS" &&
    journey.json?.nextActionLabel === "Fournir les photographies" &&
    typeof journey.json?.nextActionReason === "string" &&
    journey.json?.nextActionReason.length > 0
);

// 4. Rejet du contrat : statut interdit (point 8)
const invalid = await req("/api/journey", {
  method: "POST",
  headers: { "content-type": "application/json", ...authHeaders },
  body: JSON.stringify({
    journeyId: "x",
    documents: [{ requirementId: "identity", status: "VALIDATED_BY_AI" }],
  }),
});
check("rejet statut VALIDATED_BY_AI (422)", invalid.status === 422);

// 5. Rejet du contrat : completion en entrée (G3, point 5)
const withCompletion = await req("/api/journey", {
  method: "POST",
  headers: { "content-type": "application/json", ...authHeaders },
  body: JSON.stringify({
    journeyId: "x",
    documents: [{ requirementId: "identity", status: "ANALYZED" }],
    completion: { provided: 5, required: 3, ratio: 0.1 },
  }),
});
check("rejet completion en entrée (422)", withCompletion.status === 422);

// 6. Analyse documentaire — mode deterministic : NEEDS_REVIEW honnête (jamais "conforme")
const png = readFileSync(join(__dirname, "..", "data", "demo", "documents", "document-clair.png"));
const form = new FormData();
form.append("requirementId", "identity");
form.append("journeyId", "driving_license_new");
form.append("file", new Blob([png], { type: "image/png" }), "document-clair.png");
const analyzed = await req("/api/documents/analyze", {
  method: "POST",
  headers: authHeaders,
  body: form,
});
check(
  "POST /api/documents/analyze → NEEDS_REVIEW honnête (deterministic)",
  analyzed.status === 200 && analyzed.json?.status === "NEEDS_REVIEW" && analyzed.json?.requiresHumanReview === true,
  JSON.stringify(analyzed.json)
);

// 7. Preuve (C §66)
const ev = await req("/api/evidence/identity");
check("GET /api/evidence/identity", ev.status === 200 && ev.json?.source?.length > 0, JSON.stringify(ev.json));

// 8. Token LiveKit réel (ADR-004)
const token = await req("/api/voice/token", { method: "POST", headers: authHeaders });
check("POST /api/voice/token", token.status === 200 && typeof token.json?.token === "string" && token.json?.token.length > 20);

const ok = failed === 0;
console.log(ok ? `\nSMOKE OK (${BASE})` : `\nSMOKE FAILURE — ${failed} vérification(s) en échec`);
// Sortie propre : process.exitCode (pas process.exit) pour laisser aux sockets
// fetch le temps de se fermer — évite l'abort libuv sur Windows.
process.exitCode = ok ? 0 : 1;