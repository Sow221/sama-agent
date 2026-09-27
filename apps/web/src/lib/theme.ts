"use client";

/**
 * Thème clair / sombre de l'interface (`sama:theme`).
 *
 * Trois règles, dans cet ordre de priorité :
 *   1. le choix explicite de l'utilisateur, dans localStorage ;
 *   2. sinon le réglage du système (`prefers-color-scheme`) ;
 *   3. sinon le thème sombre, référence de la charte.
 *
 * Ce module ne fait qu'une chose : dire quel thème est actif. Il ne touche
 * ni au DOM ni au CSS — c'est `applyTheme` qui pose la classe `dark` sur
 * <html>, et les jetons de globals.css font le reste. La décision est donc
 * calculable sans navigateur, ce qui la rend testable (voir theme.test.ts).
 */
export type Theme = "light" | "dark";

/** Clef de persistance. Volontairement hors du serveur : c'est une préférence
 *  d'affichage, pas une donnée métier ni un état de dossier. */
export const THEME_KEY = "sama:theme";

/** Thème de repli quand le système ne peut pas être interrogé (pas de window,
 *  navigateur sans `matchMedia`). La charte sombre reste la référence. */
export const DEFAULT_THEME: Theme = "dark";

/** Ce que le module a besoin du navigateur, en lecture seulement. Injecté pour
 *  que la décision reste une fonction pure, testable hors DOM. */
export interface ThemeEnv {
  /** Valeur stockée, ou `null` si rien n'est stocké (ou stockage inaccessible). */
  stored: string | null;
  /** `true` si le système demande le thème sombre. `null` = inconnue. */
  systemPrefersDark: boolean | null;
}

/** Résout le thème actif. Fonction pure : mêmes entrées, même sortie. */
export function resolveTheme(env: ThemeEnv): Theme {
  if (env.stored === "dark" || env.stored === "light") return env.stored;
  if (env.systemPrefersDark === true) return "dark";
  if (env.systemPrefersDark === false) return "light";
  return DEFAULT_THEME;
}

function readEnv(): ThemeEnv {
  if (typeof window === "undefined") {
    return { stored: null, systemPrefersDark: null };
  }
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(THEME_KEY);
  } catch {
    // Navigation privée / stockage bloqué : on retombe sur le réglage système.
    stored = null;
  }
  let systemPrefersDark: boolean | null = null;
  try {
    systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    systemPrefersDark = null;
  }
  return { stored, systemPrefersDark };
}

/** Applique le thème résolu : classe `dark` sur <html> + `color-scheme`, pour
 *  que les barres de défilement et les contrôles natifs suivent aussi. */
export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.classList.toggle("light", theme === "light");
  root.style.colorScheme = theme;
}

/** Thème actif d'après le navigateur. */
export function currentTheme(): Theme {
  return resolveTheme(readEnv());
}

/** Bascule le thème et mémorise le choix explicite de l'utilisateur. */
export function toggleTheme(): Theme {
  const next: Theme = currentTheme() === "dark" ? "light" : "dark";
  applyTheme(next);
  try {
    window.localStorage.setItem(THEME_KEY, next);
  } catch {
    // Stockage indisponible : le thème bascule quand même, il ne sera pas
    // retenu au prochain chargement. Mieux vaut un réglage non mémorisé
    // qu'un thème qui ne change pas.
  }
  return next;
}
