import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, resolveTheme, type ThemeEnv } from "./theme";

/**
 * `resolveTheme` est une fonction pure : ces tests tournent sans DOM, comme
 * le reste du repo (vitest est en `environment: "node"`).
 */
const env = (stored: string | null, systemPrefersDark: boolean | null): ThemeEnv => ({
  stored,
  systemPrefersDark,
});

describe("resolveTheme", () => {
  it("suit le réglage du système quand rien n'est mémorisé", () => {
    expect(resolveTheme(env(null, true))).toBe("dark");
    expect(resolveTheme(env(null, false))).toBe("light");
  });

  it("le choix explicite de l'utilisateur passe avant le système", () => {
    expect(resolveTheme(env("light", true))).toBe("light");
    expect(resolveTheme(env("dark", false))).toBe("dark");
  });

  it("retombe sur le thème de la charte si le système est injoignable", () => {
    expect(resolveTheme(env(null, null))).toBe(DEFAULT_THEME);
    expect(DEFAULT_THEME).toBe("dark");
  });

  it("ignore une valeur mémorisée corrompue et suit le système", () => {
    // localStorage est éditable à la main, et une ancienne version de l'app a
    // pu écrire autre chose : on ne doit pas planter, ni garder une valeur aberrant.
    expect(resolveTheme(env("sombre", true))).toBe("dark");
    expect(resolveTheme(env("sombre", false))).toBe("light");
    expect(resolveTheme(env("", false))).toBe("light");
    expect(resolveTheme(env("DARK", true))).toBe("dark");
  });
});
