/**
 * Contrat du module Auth (identité réelle) — parties pures testées en Vitest :
 * - journeyIdFor : identifiant de dossier PAR-USAGER (appropriation serveur).
 * - authBearerHeaders : aucun en-tête sans Supabase configuré (mode harnais) —
 *   l'identité de service du worker s'applique, on ne masque jamais.
 */
import { describe, expect, it } from "vitest";
import { journeyIdFor } from "./journey-id";
import { authBearerHeaders } from "./supabase";

describe("journeyIdFor — dossier par-usager", () => {
  it("sans utilisateur (harnais/démo) : identifiant canonique de la procédure", () => {
    expect(journeyIdFor("driving_license_new", null)).toBe("driving_license_new");
    expect(journeyIdFor("driving_license_new", undefined)).toBe("driving_license_new");
  });

  it("avec un utilisateur : identifiant unique, déterministe et nettoyé", () => {
    const id = "a2b3c4d5-0000-0000-0000-0000000000AB";
    expect(journeyIdFor("driving_license_new", id)).toBe("driving_license_new-a2b3c4d5");
  });

  it("deux usagers différents → deux dossiers différents (jamais de collision)", () => {
    const a = journeyIdFor("driving_license_new", "11111111-0000-0000-0000-000000000001");
    const b = journeyIdFor("driving_license_new", "22222222-0000-0000-0000-000000000002");
    expect(a).not.toBe(b);
  });
});

describe("authBearerHeaders — harnais sans Supabase", () => {
  it("renvoie des en-têtes vides quand l'auth n'est pas configurée (identité de service)", async () => {
    // En environnement de test, NEXT_PUBLIC_SUPABASE_* ne sont pas définis.
    expect(await authBearerHeaders()).toEqual({});
  });
});