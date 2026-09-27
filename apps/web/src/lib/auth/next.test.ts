import { describe, expect, it } from "vitest";
import { safeNext } from "./next";

describe("safeNext — retour après connexion sans redirection ouverte", () => {
  it("accepte les pages de l'espace", () => {
    expect(safeNext("/app/home")).toBe("/app/home");
    expect(safeNext("/app/dossier/abc?x=1")).toBe("/app/dossier/abc?x=1");
    expect(safeNext("/app")).toBe("/app");
  });

  it("refuse tout ce qui sort de l'espace", () => {
    for (const bad of [null, "", "https://evil.test/app", "//evil.test/app", "/\\evil.test", "/app\\..\\x", "/login", "/apps", "app/home"]) {
      expect(safeNext(bad)).toBeNull();
    }
  });
});
