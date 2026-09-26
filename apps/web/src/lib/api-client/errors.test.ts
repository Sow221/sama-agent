/**
 * Le message d'erreur vu par l'usager.
 *
 * Ces tests verrouillent une propriété qui n'était pas respectée : sept écrans
 * affichaient « … a échoué. Réessayez. » quel que soit l'échec. Un test qui
 * exige des messages *différents* selon la cause est exactement ce qui rend
 * cette phrase unique impossible à réintroduire.
 */
import { describe, expect, it } from "vitest";
import { ApiError } from "./client";
import { toUserFacingError, traceRef } from "./errors";

const ACTION = "L'analyse de la demande";

describe("toUserFacingError", () => {
  it("distingue les échecs qui ne se réparent pas en réessayant", () => {
    // Le cœur du défaut : un 400 et un 502 ne demandent pas la même chose.
    const badRequest = toUserFacingError(new ApiError("400", 400), ACTION);
    const serverDown = toUserFacingError(new ApiError("502", 502), ACTION);
    expect(badRequest.retryable).toBe(false);
    expect(serverDown.retryable).toBe(true);
    expect(badRequest.message).not.toBe(serverDown.message);
  });

  it("oriente vers la reconnexion sur un 401", () => {
    const e = toUserFacingError(new ApiError("401", 401), ACTION);
    expect(e.message).toMatch(/session/i);
    expect(e.retryable).toBe(false);
  });

  it("demande d'attendre sur un 429", () => {
    const e = toUserFacingError(new ApiError("429", 429), ACTION);
    expect(e.retryable).toBe(true);
    expect(e.message).toMatch(/patientez|attendez/i);
  });

  it("reconnaît une panne réseau (aucun statut HTTP)", () => {
    // `fetch` rejette avec une TypeError : il n'y a pas de `status`, et l'écran
    // ne doit pas prétendre que « le service a refusé ».
    const e = toUserFacingError(new TypeError("Failed to fetch"), ACTION);
    expect(e.status).toBeUndefined();
    expect(e.retryable).toBe(true);
    expect(e.message).toMatch(/ne répond pas|connexion/i);
  });

  it("ne montre jamais de corps de réponse technique à l'usager", () => {
    // ApiError.message contient statut + extrait brut du corps (souvent du
    // JSON de validation). Il ne doit pas fuiter tel quel.
    const raw = '{"detail":[{"loc":["body","documents"],"msg":"champ inconnu"}]}';
    const e = toUserFacingError(new ApiError(`API /api/journey → 422 : ${raw}`, 422), ACTION);
    expect(e.message).not.toContain("champ inconnu");
    expect(e.message).not.toContain("{");
  });

  it("conserve l'identifiant de trace pour le support", () => {
    const e = toUserFacingError(new ApiError("500", 500, "req-abc123"), ACTION);
    expect(e.requestId).toBe("req-abc123");
    expect(traceRef(e.requestId)).toContain("req-abc123");
  });

  it("n'invente pas d'identifiant de trace quand il n'y en a pas", () => {
    const e = toUserFacingError(new ApiError("500", 500), ACTION);
    expect(e.requestId).toBeUndefined();
    expect(traceRef(e.requestId)).toBeNull();
  });

  it("avoue son ignorance plutôt que d'inventer une cause", () => {
    const e = toUserFacingError("peut-être un problème", ACTION);
    expect(e.message).toMatch(/inconnue/i);
  });

  it("produit un message français non vide et jamais la phrase figée d'avant", () => {
    const causes: unknown[] = [
      new ApiError("400", 400),
      new ApiError("401", 401),
      new ApiError("403", 403),
      new ApiError("404", 404),
      new ApiError("429", 429),
      new ApiError("500", 500),
      new TypeError("Failed to fetch"),
      new Error("boom"),
      null,
      42,
    ];
    for (const cause of causes) {
      const e = toUserFacingError(cause, ACTION);
      expect(e.message.length, `message vide pour ${String(cause)}`).toBeGreaterThan(0);
      // Aucun résidu de la phrase unique d'avant.
      expect(e.message).not.toBe("L'analyse de la demande a échoué. Réessayez.");
      // Aucune fuite de détail technique.
      expect(e.message).not.toContain("{");
      expect(e.message).not.toMatch(/\bundefined\b|\bnull\b|\[object/);
    }
  });

  it("nomme l'action pour les échecs propres à l'action, pas pour les globaux", () => {
    // Un 422 concerne CETTE requête : dire laquelle aide. Un 401 ou un 429 est
    // général (« reconnectez-vous », « patientez ») : répéter l'action
    // n'apporterait rien et laisserait croire qu'elle est en cause.
    const perAction = [
      new ApiError("400", 400),
      new ApiError("403", 403),
      new ApiError("404", 404),
      new ApiError("500", 500),
    ];
    for (const cause of perAction) {
      expect(
        toUserFacingError(cause, ACTION).message,
        `action non nommée pour ${cause}`
      ).toContain(ACTION);
    }

    const global = [new ApiError("401", 401), new ApiError("429", 429)];
    for (const cause of global) {
      expect(
        toUserFacingError(cause, ACTION).message,
        `action à tort nommée pour ${cause}`
      ).not.toContain(ACTION);
    }
  });
});
