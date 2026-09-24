/**
 * Contrats partagés (plan point 14) : packages/shared/contracts/*.json est LA source
 * commune entre Zod (ici) et Pydantic (pytest tests/matrix/test_contracts.py).
 * Un changement de contrat invalide doit être rejeté AVANT la production.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { journeyRequestSchema, journeyResponseSchema } from "./index";

const CONTRACTS = resolve(process.cwd(), "../../packages/shared/contracts");

function load(name: string): unknown {
  return JSON.parse(readFileSync(resolve(CONTRACTS, name), "utf8"));
}

describe("contrats partagés (Zod) — parité avec Pydantic", () => {
  it("accepte le payload de référence de la démo 2/3 (point 13)", () => {
    const parsed = journeyResponseSchema.parse(load("journey-response-valid.json"));
    expect(parsed.nextAction).toBe("PROVIDE_PHOTOS");
    expect(parsed.nextActionLabel).toBe("Fournir les photographies");
    expect(parsed.nextActionReason).toBeTruthy();
    expect(parsed.completion.ratio).toBeCloseTo(2 / 3, 6);
  });

  it("rejette un statut de document invalide (point 8 : jamais VALIDATED_BY_AI)", () => {
    expect(() =>
      journeyRequestSchema.parse(load("journey-request-invalid-status.json"))
    ).toThrow();
  });

  it("rejette une completion envoyée par le client (G3, point 5 : toujours dérivée)", () => {
    expect(() =>
      journeyRequestSchema.parse(load("journey-request-with-completion.json"))
    ).toThrow();
  });
});