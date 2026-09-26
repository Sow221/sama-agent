import { describe, expect, it } from "vitest";
import { frenchAuthError } from "./supabase";

describe("frenchAuthError", () => {
  it("réseau coupé : message français, jamais « Failed to fetch »", () => {
    const e = new Error("Failed to fetch");
    e.name = "AuthRetryableFetchError";
    expect(frenchAuthError(e).message).toMatch(/Connexion au service impossible/);
  });

  it("identifiants invalides : message français", () => {
    expect(frenchAuthError(new Error("Invalid login credentials")).message).toBe(
      "E-mail ou mot de passe incorrect."
    );
  });
});
