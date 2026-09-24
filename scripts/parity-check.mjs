#!/usr/bin/env node
/**
 * parity-check.mjs — vérifie que enums.ts ≡ enums.py ≡ enums.json (CI)
 * Deux formes de valeurs supportées (source unique, ADR-006/D3) :
 *   - liste  → enums canoniques (const array TS / classes Enum Python)
 *   - dict   → terminologie clé→valeur (ex. next_action_label)
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const enums = JSON.parse(readFileSync(join(root, "packages/shared/enums.json"), "utf8"));
const tsSrc = readFileSync(join(root, "packages/shared/gen/enums.ts"), "utf8");
const pySrc = readFileSync(join(root, "packages/shared/gen/enums.py"), "utf8");

const pascal = (key) =>
  "".concat(...key.split("_").map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()));

let failed = 0;
const fail = (msg) => {
  console.error(msg);
  failed++;
};

for (const [key, values] of Object.entries(enums)) {
  if (key === "_source") continue;
  const typeName = key.toUpperCase();
  const className = pascal(key);
  const isDict = !Array.isArray(values);

  // TS — const (array ou object) présente
  if (!tsSrc.includes(`export const ${typeName} =`)) {
    fail(`TS : const ${typeName} absente`);
    continue;
  }
  // TS — union / types dérivés
  if (isDict) {
    if (!tsSrc.includes(`export type ${className} = keyof typeof ${typeName};`)) {
      fail(`TS : type ${className} (clés) absent`);
    }
    if (!tsSrc.includes(`export type ${className}Value = (typeof ${typeName})[${className}];`)) {
      fail(`TS : type ${className}Value (valeurs) absent`);
    }
  } else if (!tsSrc.includes(`export type ${typeName} = (typeof ${typeName})[number];`)) {
    fail(`TS : union type ${typeName} absent`);
  }

  // Python — classe + membres (dans les deux formes)
  if (!pySrc.includes(`class ${className}(str, Enum):`)) {
    fail(`Python : classe ${className} absente`);
    continue;
  }
  const entries = isDict ? Object.entries(values) : values.map((v) => [v, v]);
  for (const [member, value] of entries) {
    if (!pySrc.includes(`    ${member} = ${JSON.stringify(value)}`)) {
      fail(`Python manquant : ${className}.${member}`);
    }
  }

  // TS — chaque valeur/valeur-clé présente
  for (const v of isDict ? Object.values(values) : values) {
    if (!tsSrc.includes(JSON.stringify(v))) {
      fail(`TS manquant : ${key}.${v}`);
    }
  }
}

if (failed > 0) {
  console.error(`\nPARITY FAILED — ${failed} divergence(s) (régénérer via : npm run gen:enums)`);
  process.exit(1);
}
console.log("PARITY OK — enums.ts ≡ enums.py ≡ enums.json");