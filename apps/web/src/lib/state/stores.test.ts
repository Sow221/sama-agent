import { describe, expect, it } from "vitest";
import { deriveCompletion } from "@/lib/state/stores";
import { journeyResponseSchema } from "@/lib/schemas";

describe("deriveCompletion (G3 : TOUJOURS dérivée)", () => {
  it("calcule le ratio exact", () => {
    const c = deriveCompletion(2, 3);
    expect(c.provided).toBe(2);
    expect(c.required).toBe(3);
    expect(c.ratio).toBeCloseTo(2 / 3, 6);
  });

  it("borne le ratio à 1", () => {
    expect(deriveCompletion(5, 3).ratio).toBe(1);
  });

  it("protège contre required = 0", () => {
    const c = deriveCompletion(0, 0);
    expect(c.required).toBe(1);
    expect(c.provided).toBe(0);
  });
});

describe("journeyResponseSchema (contrat ADR-007)", () => {
  const base = {
    journeyId: "driving_license_new",
    procedureId: "driving_license_new",
    status: "NEEDS_DOCUMENT",
    steps: [
      { id: "understand", name: "Comprendre", order: 1, status: "done" },
      { id: "prepare", name: "Préparer", order: 2, status: "active" },
      { id: "verify", name: "Vérifier", order: 3, status: "todo" },
      { id: "act", name: "Agir", order: 4, status: "todo" },
    ],
    completion: { provided: 2, required: 3, ratio: 2 / 3 },
    documents: [
      { requirementId: "identity", name: "Pièce d'identité", status: "ANALYZED" },
      { requirementId: "medical", name: "Certificat médical", status: "ANALYZED" },
      { requirementId: "photos", name: "Photographies", status: "MISSING" },
    ],
    nextAction: "PROVIDE_PHOTOS",
    nextActionRequirement: "photos",
  };

  it("accepte la réponse démo 2/3", () => {
    expect(journeyResponseSchema.parse(base).documents).toHaveLength(3);
  });

  it("rejette un statut de document inconnu (parité enums)", () => {
    expect(() =>
      journeyResponseSchema.parse({ ...base, documents: [{ ...base.documents[0], status: "VALIDATED_BY_AI" }] })
    ).toThrow();
  });

  it("rejette une completion non dérivée cohérente (ratio hors bornes)", () => {
    expect(() =>
      journeyResponseSchema.parse({ ...base, completion: { provided: 2, required: 3, ratio: 5 } })
    ).toThrow();
  });
});