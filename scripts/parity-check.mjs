#!/usr/bin/env node
/**
 * parity-check.mjs — vérifie que enums.ts ≡ enums.py ≡ enums.json (CI)
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const enums = JSON.parse(readFileSync(join(root, "packages/shared/enums.json"), "utf8"));
const tsSrc = readFileSync(join(root, "packages/shared/gen/enums.ts"), "utf8");
const pySrc = readFileSync(join(root, "packages/shared/gen/enums.py"), "utf8");

let failed = 0;
for (const [key, values] of Object.entries(enums)) {
  if (key === "_source") continue;

  // TS : chaque valeur dans la const array
  for (const v of values) {
    if (!tsSrc.includes(`"${v}"`)) {
      console.error(`TS manquant : ${key}.${v}`);
      failed++;
    }
  }
  // TS : union type présente
  const typeName = key.toUpperCase();
  if (!tsSrc.includes(`type ${typeName} = (typeof ${typeName})[number]`)) {
    console.error(`TS : union type ${typeName} absent`);
    failed++;
  }

  // Python : classe + membres
  const className = "".concat(
    ...key.split("_").map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
  );
  if (!pySrc.includes(`class ${className}(str, Enum):`)) {
    console.error(`Python : classe ${className} absente`);
    failed++;
  }
  for (const v of values) {
    if (!pySrc.includes(`    ${v} = "${v}"`)) {
      console.error(`Python manquant : ${className}.${v}`);
      failed++;
    }
  }
}

if (failed > 0) {
  console.error(`\nPARITY FAILED — ${failed} divergence(s) (régénérer via : npm run gen:enums)`);
  process.exit(1);
}
console.log("PARITY OK — enums.ts ≡ enums.py ≡ enums.json");