/**
 * Lecture de session — le blocage qui rendait l'application inutilisable.
 *
 * Régression d'un défaut P0 observé en e2e : les quatre tests tombaient sur un
 * écran réduit à « chargement ». `AuthProvider` appelait `getSession()` sans
 * `catch` ; un rejet laissait `loading` à `true` DÉFINITIVEMENT, donc
 * `AuthGate` ne rendait plus que son spinner, sur toutes les pages, sans
 * message, sans action et sans trace.
 *
 * Ces tests verrouillent les trois propriétés qui empêchent le retour du
 * défaut. Le premier est la régression directe : avant le correctif, il était
 * impossible d'écrire ce test, car la fonction n'existait pas — l'effet
 * `useEffect` n'était testable qu'avec un DOM, absent du projet.
 */
import { describe, expect, it, vi } from "vitest";
import { readSessionOnce, SESSION_UNAVAILABLE } from "./session-bootstrap";
import type { SupabaseAuth } from "./supabase";

/** Flux minimal, avec les pièces paresseuses du contrat. */
function flowWith(over: Partial<SupabaseAuth>): SupabaseAuth {
  return {
    getSession: vi.fn(async () => null),
    onAuthStateChange: vi.fn(() => () => {}),
    signInWithPassword: vi.fn(async () => {}),
    signUp: vi.fn(async () => {}),
    signInWithGoogle: vi.fn(async () => {}),
    signOut: vi.fn(async () => {}),
    ...over,
  } as SupabaseAuth;
}

const fakeSession = { access_token: "tok" } as never;

describe("readSessionOnce — ne rejette jamais", () => {
  it("session trouvée : la rend telle quelle", async () => {
    const out = await readSessionOnce(flowWith({ getSession: vi.fn(async () => fakeSession) }));
    expect(out.session).toBe(fakeSession);
    expect(out.error).toBeNull();
  });

  it("REGRESSION : getSession qui rejette ne fait pas planter la lecture", async () => {
    // Avant : `.then()` sans `.catch()` → `loading` restait `true` pour toujours
    // → spinner éternel sur toute l'application. Ce test est ce test-là.
    const flow = flowWith({
      getSession: vi.fn(async () => {
        throw new Error("Fetch failed");
      }),
    });
    const out = await readSessionOnce(flow);
    expect(out.error).toBe(SESSION_UNAVAILABLE);
    expect(out.session).toBeNull();
  });

  it("distingue « pas connecté » de « lecture impossible »", async () => {
    // Confusion historique à éviter : les deux mènent à des écrans différents
    // (formulaire de connexion vs. erreur explicite avec bouton Réessayer).
    const noSession = await readSessionOnce(flowWith({ getSession: vi.fn(async () => null) }));
    const broken = await readSessionOnce(
      flowWith({
        getSession: vi.fn(async () => {
          throw new Error("boom");
        }),
      })
    );
    expect(noSession.error).toBeNull();
    expect(broken.error).not.toBeNull();
    expect(noSession.error).not.toBe(broken.error);
  });

  it("harnais (Supabase non configuré) : pas une erreur, juste pas de session", async () => {
    const out = await readSessionOnce(null);
    expect(out).toEqual({ session: null, error: null });
  });

  it("n'abonne pas à onAuthStateChange (l'abonnement a une durée de vie)", async () => {
    // Une lecture ponctuelle qui s'abonne sans jamais résilier fuirait un
    // abonnement par montage. La gestion appartient à AuthProvider.
    const flow = flowWith({});
    await readSessionOnce(flow);
    expect(flow.onAuthStateChange).not.toHaveBeenCalled();
  });

  it("ne divulgue pas le détail technique de l'échec à l'écran", async () => {
    const out = await readSessionOnce(
      flowWith({
        getSession: vi.fn(async () => {
          throw new Error("https://xyz.supabase.co/auth/v1/token?key=sk_live_SECRETE");
        }),
      })
    );
    expect(out.error).not.toContain("SECRETE");
    expect(out.error).not.toContain("supabase.co");
    expect(out.error).toBe(SESSION_UNAVAILABLE);
  });
});
