#!/usr/bin/env node
/**
 * gen-enums.mjs
 * Génère enums.ts (TypeScript) et enums.py (Pydantic/Enum) depuis packages/shared/enums.json
 * Source unique : ADR-006 (voir panning/ADR/ADR-006-gaps-contenu.md)
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const enums = JSON.parse(readFileSync(join(root, "packages/shared/enums.json"), "utf8"));
const outDir = join(root, "packages/shared/gen");
mkdirSync(outDir, { recursive: true });

const skipKeys = new Set(["_source"]);

/** TypeScript : const arrays + union types */
function toTS() {
  const lines = [
    "// GÉNÉRÉ — ne pas éditer (source : packages/shared/enums.json via scripts/gen-enums.mjs)",
    "// ADR-006 : enums canoniques Sama Agent (parité TS ≡ Python ≡ JSON)",
    "",
  ];
  for (const [key, values] of Object.entries(enums)) {
    if (skipKeys.has(key)) continue;
    const typeName = key.toUpperCase();
    if (!Array.isArray(values)) {
      // Dictionnaire (ex. next_action_label) : const object + types clé/valeur
      const entryLines = Object.entries(values)
        .map(([k, v]) => `  ${k}: ${JSON.stringify(v)},`)
        .join("\n");
      const pascal = "".concat(
        ...key.split("_").map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
      );
      lines.push(`export const ${typeName} = {\n${entryLines}\n} as const;`);
      lines.push(`export type ${pascal} = keyof typeof ${typeName};`);
      lines.push(`export type ${pascal}Value = (typeof ${typeName})[${pascal}];`);
      lines.push("");
      continue;
    }
    const literal = values.map((v) => JSON.stringify(v)).join(", ");
    lines.push(`export const ${typeName} = [${literal}] as const;`);
    lines.push(`export type ${typeName} = (typeof ${typeName})[number];`);
    lines.push("");
  }
  return lines.join("\n");
}

/** Python : classes Enum (str) */
function toPy() {
  const lines = [
    '# GÉNÉRÉ — ne pas éditer (source : packages/shared/enums.json via scripts/gen-enums.mjs)',
    '# ADR-006 : enums canoniques Sama Agent (parité TS ≡ Python ≡ JSON)',
    '',
    'from enum import Enum',
    '',
  ];
  for (const [key, values] of Object.entries(enums)) {
    if (skipKeys.has(key)) continue;
    const className = "".concat(
      ...key.split("_").map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    );
    lines.push(`class ${className}(str, Enum):`);
    if (!Array.isArray(values)) {
      for (const [k, v] of Object.entries(values)) {
        lines.push(`    ${k} = ${JSON.stringify(v)}`);
      }
    } else {
      for (const v of values) {
        lines.push(`    ${v} = "${v}"`);
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

const ts = toTS();
const py = toPy();
writeFileSync(join(outDir, "enums.ts"), ts);
writeFileSync(join(outDir, "enums.py"), py);

console.log(`gen-enums OK : ${Object.keys(enums).length - skipKeys.size} enums`);
for (const [k, v] of Object.entries(enums)) {
  if (skipKeys.has(k)) {
    console.log(`  ${k}: (source)`);
  } else if (Array.isArray(v)) {
    console.log(`  ${k}: ${v.join(", ")}`);
  } else {
    console.log(`  ${k}: {${Object.keys(v).length} entrées de terminologie}`);
  }
}