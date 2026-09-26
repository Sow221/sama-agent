/**
 * Les classes Tailwind qui n'existent pas.
 *
 * Un nom de couleur erroné ne provoque **aucune erreur** : ni TypeScript, ni
 * Tailwind, ni le navigateur. La classe est simplement ignorée et l'élément
 * s'affichera sans le style voulu. Deux bugs de cette famille ont été trouvés
 * dans ce lot :
 *
 *  - `text-warn` alors que la clé du thème est `warning` → le texte de
 *    l'écran de compréhension s'affichait sans sa couleur d'alerte ;
 *  - `bg-surface2` alors que la clé est `surface-2` → les deux panneaux de
 *    transcription et de message de l'écran vocal s'affichaient SANS fond.
 *
 * Aucun test ne les voyait : le rendu est « correct », seule l'apparence est
 * fausse. Ce test compare donc les jetons utilisés dans les sources aux clés
 * réellement déclarées dans `tailwind.config.ts`.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const WEB_ROOT = resolve(__dirname, "..", "..");
const SRC = join(WEB_ROOT, "src");
const TAILWIND_CONFIG = join(WEB_ROOT, "tailwind.config.ts");

/** Préfixes Tailwind qui portent une couleur dans ce thème. */
const COLOR_PREFIXES = ["text", "bg", "border", "from", "via", "ring", "fill", "stroke"] as const;

/** Suffixes qui ne sont PAS des couleurs (positions, tailles, motifs…). */
const NOT_A_COLOR = new Set([
  // positions et directions
  "b", "t", "l", "r", "x", "y", "base", "center", "top", "bottom", "left", "right",
  "inset", "start", "end",
  // tailles
  "xs", "sm", "lg", "xl", "2xl", "3xl", "4xl", "full", "min", "max", "fit",
  // variantes et motifs
  "solid", "dashed", "dotted", "double", "none", "hidden", "auto", "inherit",
  "current", "ellipsis", "wrap", "nowrap", "clip", "reverse",
  // palette Tailwind intégrée
  "black", "white", "transparent", "currentcolor",
]);

/** Extrait les clés d'un bloc `nom: { … }` du fichier de thème. */
function themeKeys(config: string, blockName: string): Set<string> {
  // Le bloc recherché est celui indenté de 6 espaces (voir tailwind.config.ts).
  const re = new RegExp(`\\b${blockName}:\\s*\\{([\\s\\S]*?)\\n\\s{6}\\},`);
  const block = config.match(re);
  if (!block) throw new Error(`bloc ${blockName}: introuvable dans tailwind.config.ts`);
  const keys: string[] = [];
  for (const line of block[1].split("\n")) {
    const m = line.match(/^\s*"?([A-Za-z0-9-]+)"?\s*:/);
    if (m) keys.push(m[1]);
  }
  return new Set(keys);
}

const CONFIG_SRC = readFileSync(TAILWIND_CONFIG, "utf8");
const COLORS = themeKeys(CONFIG_SRC, "colors");
const SHADOWS = themeKeys(CONFIG_SRC, "boxShadow");

/**
 * Utilitaires maison déclarés en CSS brut (`text-gradient`, `ring-pulse`…).
 * Ils sont lus dans globals.css, pas codés en dur : si on les supprime de la
 * feuille de style, ce test échoue au lieu de valider un nom mort.
 */
function customCssClasses(): Set<string> {
  const css = readFileSync(join(WEB_ROOT, "src", "styles", "globals.css"), "utf8");
  const out = new Set<string>();
  for (const m of css.matchAll(/\.([a-z][a-z0-9-]*)\s*[,{]/g)) out.add(m[1]);
  return out;
}
const CSS_CLASSES = customCssClasses();

/**
 * Un préfixe de couleur suivi d'un nom de couleur.
 *
 * Deux subtilités :
 *  - `border-strong` : le préfixe `border` fait partie du NOM de la couleur.
 *    On teste donc aussi `border-<reste>` ;
 *  - `border-t-primary` : `t` est le CÔTÉ de la bordure, `primary` la couleur.
 */
const COLOR_RE = new RegExp(
  `\\b(?:${COLOR_PREFIXES.join("|")})-((?:[tblrxy]-)?[a-z][a-z0-9-]*)`,
  "g"
);

/** `bg-gradient-to-br` contient `to-br`, qui n'est pas une couleur. */
const GRADIENT_RE = /\b(?:bg|from|via|to)-gradient-to-[a-z0-9]+/g;

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    // On ne scanne pas ce fichier : il cite les fautes en clair.
    else if (/\.tsx?$/.test(entry) && !entry.startsWith("theme-colors.")) out.push(full);
  }
  return out;
}

describe("jetons de couleur Tailwind", () => {
  it("a bien extrait les palettes du thème (garde-fou du test lui-même)", () => {
    // Si cette extraction échoue, le test suivant validerait du vide. On veut
    // un échec bruyant plutôt qu'un faux « tout est correct ».
    expect(COLORS.size).toBeGreaterThan(10);
    expect(COLORS.has("primary")).toBe(true);
    expect(COLORS.has("warning")).toBe(true);
    expect(SHADOWS.has("glow")).toBe(true);
    // `warn` n'a jamais été une clé : c'est exactement la faute recherchée.
    expect(COLORS.has("warn")).toBe(false);
    // `surface2` non plus (la clé est `surface-2`) : l'autre faute.
    expect(COLORS.has("surface2")).toBe(false);
    // Les utilitaires CSS sont bien détectés (sinon le test serait biaisé).
    expect(CSS_CLASSES.has("text-gradient")).toBe(true);
    expect(CSS_CLASSES.has("ring-pulse")).toBe(true);
  });

  it("n'utilise que des couleurs déclarées dans le thème", () => {
    const unknown: string[] = [];
    for (const file of sourceFiles(SRC)) {
      // Les dégradés sont neutralisés : `to-br` y est un mot-clé, pas une couleur.
      const src = readFileSync(file, "utf8").replace(GRADIENT_RE, " ");
      for (const m of src.matchAll(COLOR_RE)) {
        const tail = m[1];
        if (NOT_A_COLOR.has(tail)) continue;
        // `border-strong` : le préfixe fait partie du nom de la couleur.
        if (COLORS.has(`border-${tail}`)) continue;
        // `border-t-primary` : `t` est le côté, `primary` la couleur.
        const withoutSide = tail.replace(/^[tblrxy]-/, "");
        if (withoutSide !== tail && COLORS.has(withoutSide)) continue;
        if (COLORS.has(tail)) continue;
        // Utilitaire défini en CSS brut : `text-gradient`, `ring-pulse`. La
        // clé est la classe ENTIÈRE, pas le suffixe.
        if (CSS_CLASSES.has(m[0])) continue;
        unknown.push(`${relative(WEB_ROOT, file)} : « ${m[0]} »`);
      }
    }
    expect(
      unknown,
      `classes Tailwind sans couleur déclarée — l'élément s'affichera SANS ce style :\n` +
        unknown.join("\n")
    ).toEqual([]);
  });

  it("n'utilise que des ombres déclarées dans le thème", () => {
    const unknown: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/\bshadow-([a-z][a-z0-9-]*)/g)) {
        const token = m[1];
        if (NOT_A_COLOR.has(token) || token.startsWith("[")) continue;
        if (SHADOWS.has(token) || COLORS.has(token) || CSS_CLASSES.has(m[0])) continue;
        unknown.push(`${relative(WEB_ROOT, file)} : « shadow-${token} »`);
      }
    }
    expect(
      unknown,
      `classes d'ombre non déclarées dans tailwind.config.ts :\n` + unknown.join("\n")
    ).toEqual([]);
  });
});
