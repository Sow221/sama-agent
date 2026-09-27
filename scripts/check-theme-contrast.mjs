/**
 * Contrôle de contraste des deux thèmes (script de vérification, pas un test).
 *
 *   node scripts/check-theme-contrast.mjs
 *
 * Ne remplace ni un test ni l'œil humain sur l'écran : il attrape le cas
 * mécanique, c'est-à-dire une couleur de texte qui passe sous 4.5:1 une fois
 * le thème clair appliqué. Les paires sont celles que l'app pose réellement
 * (tokens de globals.css), lues dans les deux blocs.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const css = readFileSync(join(root, "apps/web/src/styles/globals.css"), "utf8");

/** Extrait le jeu de jetons d'un bloc `:root` ou `:root.dark`. */
function tokens(selector) {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`bloc introuvable : ${selector}`);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
  const out = {};
  for (const [, name, value] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    out[name] = value.trim();
  }
  return out;
}

function hex(c) {
  const h = c.replace("#", "").trim();
  const full = h.length === 3 ? [...h].map((x) => x + x).join("") : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
}

/** Résout `var(--x)` et `#rgb` / `r g b` en [r,g,b,a]. */
function resolve(value, set) {
  let v = value.trim();
  const varMatch = v.match(/^var\((--[\w-]+)\)$/);
  if (varMatch) v = set[varMatch[1]];
  if (v.startsWith("#")) return [...hex(v), 1];
  const nums = v.match(/-?[\d.]+/g);
  if (!nums || nums.length < 3) throw new Error(`couleur non gérée : ${value}`);
  return [Number(nums[0]), Number(nums[1]), Number(nums[2]), nums[3] === undefined ? 1 : Number(nums[3])];
}

/** Aplati une couleur translucide sur un fond opaque. */
function over(fg, bg) {
  const a = fg[3];
  return [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a));
}
function luminance([r, g, b]) {
  const f = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
/** Contraste entre deux couleurs DÉJÀ aplaties (tableau de 3 canaux). */
function ratio(fg, bg) {
  const a = luminance(over([...fg, 1], bg));
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const THEMES = [
  { name: "clair", set: tokens(":root {") },
  { name: "sombre", set: tokens(":root.dark {") },
];

/**
 * Pairs [foreground, background, minimum, label] — the app's real usages.
 * Note: the background tokens are often translucent (`--surface`, `--header-bg`,
 * the borders). They are composited over the page first, otherwise a 3.5 % ink
 * surface would be compared as if it were opaque ink and every text on it
 * would "fail" at 1:1.
 */
const PAIRS = [
  ["--text-1", "--bg", 4.5, "corps de texte"],
  ["--text-2", "--bg", 4.5, "texte secondaire"],
  ["--text-muted", "--bg", 4.5, "texte discret (étiquettes, horodatages)"],
  ["--primary", "--bg", 4.5, "sur-titre `text-primary`"],
  ["--accent-ai", "--bg", 4.5, "texte `text-accent-ai`"],
  ["--success", "--bg", 4.5, "texte `text-success`"],
  ["--warning", "--bg", 4.5, "texte `text-warning`"],
  ["--danger", "--bg", 4.5, "texte `text-danger`"],
  ["--error", "--bg", 4.5, "texte `text-error` (action destructive)"],
  ["--text-1", "--surface-elevated", 4.5, "texte sur carte surélevée"],
  ["--text-2", "--surface", 4.5, "texte sur surface"],
  ["--text-muted", "--surface-2", 4.5, "texte sur surface 2"],
  ["--on-primary", "--primary", 4.5, "texte du bouton principal"],
  ["--text-1", "--header-bg", 4.5, "texte dans l'en-tête translucide"],
  ["--text-2", "--bottom-nav-bg", 4.5, "texte dans la barre basse"],
  // Pas de contrôle 3:1 sur les bordures : `--border-strong` n'est jamais le
  // seul indice d'un contrôle (bouton accompagné de son libellé, état de
  // focus doublé d'un `ring`, barre décorative `aria-hidden`). Le seuil 3:1 du
  // WCAG 1.4.11 ne s'applique donc à aucune de ces trois utilisations.
];

let failed = 0;
for (const { name, set } of THEMES) {
  console.log(`\n── thème ${name} ──`);
  const page = over(resolve(set["--bg"], set), [255, 255, 255]);
  for (const [fgName, bgName, min, label] of PAIRS) {
    const bg = over(resolve(set[bgName], set), page); // aplati sur la page
    const fg = over(resolve(set[fgName], set), bg);
    const r = ratio(fg, bg);
    const ok = r >= min;
    if (!ok) failed++;
    console.log(
      `${ok ? "  ok  " : "  ÉCHEC"} ${r.toFixed(2).padStart(5)}:1 (min ${min})  ${label}  ${fgName} sur ${bgName}`
    );
  }
}

console.log(
  failed === 0
    ? "\nTous les couples de texte passent le contraste AA dans les deux thèmes."
    : `\n${failed} couple(s) sous le seuil.`
);
process.exit(failed === 0 ? 0 : 1);
