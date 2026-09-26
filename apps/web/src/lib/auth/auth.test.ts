/**
 * Contrat du module Auth (identité réelle) — parties pures testées en Vitest :
 * - journeyIdFor : identifiant de dossier PAR-USAGER (appropriation serveur).
 * - authBearerHeaders : aucun en-tête sans Supabase configuré (mode harnais) —
 *   l'identité de service du worker s'applique, on ne masque jamais.
 * - authBearerHeaders NE REJETTE JAMAIS : c'est vérifié en simulant une auth
 *   configurée dont la lecture de session échoue.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { journeyIdFor, procedureIdOf } from "./journey-id";
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

describe("procedureIdOf — retrouver la procédure d'un dossier", () => {
  it("identifiant canonique : inchangé", () => {
    expect(procedureIdOf("driving_license_new")).toBe("driving_license_new");
  });

  it("dossier par-usager : le suffixe est retiré", () => {
    expect(procedureIdOf("driving_license_new-a2b3c4d5")).toBe("driving_license_new");
  });
});

describe("authBearerHeaders — harnais sans Supabase", () => {
  it("renvoie des en-têtes vides quand l'auth n'est pas configurée (identité de service)", async () => {
    // En environnement de test, NEXT_PUBLIC_SUPABASE_* ne sont pas définis.
    expect(await authBearerHeaders()).toEqual({});
  });
});

describe("authBearerHeaders — auth configurée", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  /** Réimporte le module avec l'auth « configurée » (constantes lues au chargement). */
  async function withAuthConfigured() {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://projet.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "cle-anon");
    vi.resetModules();
    return import("./supabase");
  }

  it("joint le jeton quand l'usager est connecté", async () => {
    const { authBearerHeaders } = await withAuthConfigured();
    const headers = await authBearerHeaders(async () => ({ session: { access_token: "tok-1" } }));
    expect(headers).toEqual({ authorization: "Bearer tok-1" });
  });

  it("ne joint rien quand la session est simplement absente", async () => {
    // État normal : personne n'est connecté. Ce n'est pas une erreur.
    const { authBearerHeaders } = await withAuthConfigured();
    expect(await authBearerHeaders(async () => ({ session: null }))).toEqual({});
  });

  it("REGRESSION : une lecture de session en échec ne fait PAS échouer l'appel", async () => {
    // Le défaut : le rejet remontait de `authBearerHeaders`, donc `request()`
    // échouait AVANT `fetch`. Une Supabase instable rendait cassées toutes les
    // requêtes de l'application, y compris celles qui n'exigent pas d'auth.
    // Constaté en e2e : l'app entière bloquée sur « chargement ».
    const { authBearerHeaders } = await withAuthConfigured();
    const headers = await authBearerHeaders(async () => {
      throw new Error("Fetch failed");
    });
    expect(headers).toEqual({});
  });

  it("reste muet sur l'échec : pas de secret divulgué, pas de rejet", async () => {
    const { authBearerHeaders } = await withAuthConfigured();
    let thrown: unknown = null;
    try {
      await authBearerHeaders(async () => {
        throw new Error("https://xyz.supabase.co/auth/v1?key=SECRET");
      });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeNull();
  });
});