/**
 * Parité du protocole vocal entre Python et TypeScript.
 *
 * Le canal de données est implémenté deux fois : `services/worker/agent/voice/
 * protocol.py` (émetteur) et `src/lib/schemas/index.ts` (récepteur). Sans test
 * de parité, les deux dérivent silencieusement — et le symptôme est invisible
 * jusqu'au jour J : l'agent parle, l'écran ne bouge pas, personne ne sait pourquoi.
 *
 * Ce test LIT le fichier Python et compare ses constantes à celles de TypeScript.
 * Il échoue donc si un nom d'événement, un état ou un code d'erreur est ajouté
 * d'un seul côté.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AGENT_ERROR_CODES,
  AGENT_STATES,
  AGENT_TEXT_ROLES,
  agentEventSchema,
  voiceEventSchema,
} from "./index";

const PROTOCOL_PY = resolve(process.cwd(), "../../services/worker/agent/voice/protocol.py");

/**
 * Lit une constante Python, y compris multi-lignes (`frozenset({…})`).
 * On lit jusqu'à ce que les accolades et parenthèses soient équilibrées — sinon
 * on ne capturerait que la première ligne d'un ensemble et la comparaison ne
 * porterait sur aucun nom réel.
 */
function pyConst(name: string): string {
  const lines = readFileSync(PROTOCOL_PY, "utf8").split("\n");
  const start = lines.findIndex((l) => l.startsWith(`${name} = `));
  if (start < 0) throw new Error(`${name} introuvable dans protocol.py`);
  let expr = lines[start].slice(`${name} = `.length);
  let depth = () =>
    (expr.match(/[[{(]/g)?.length ?? 0) - (expr.match(/[\])}]/g)?.length ?? 0);
  let end = start;
  while (depth() > 0 && end + 1 < lines.length) {
    end += 1;
    expr += " " + lines[end].trim();
  }
  return expr.trim().replace(/,$/, "").replace(/^["']|["']$/g, "");
}

/** Extrait les littéraux d'une expression Python (`"a"`, `("a", "b")`…). */
function pyLiterals(expr: string): string[] {
  return [...expr.matchAll(/["']([^"']+)["']/g)].map((m) => m[1]);
}

/**
 * Résout un ensemble Python (`frozenset({A, B})` ou `(A, B)`) en VALEURS
 * concrètes. Ces constantes ne contiennent que des RÉFÉRENCES à d'autres
 * constantes : sans résolution, la comparaison porterait sur
 * `["ST_LISTENING", …]` et le test ne vérifierait aucun nom d'événement réel.
 */
function pySet(name: string): string[] {
  const expr = pyConst(name);
  const inner = /\{([^}]*)\}/.exec(expr)?.[1] ?? expr;
  return inner
    .split(",")
    .map((part) => part.replace(/[^A-Za-z0-9_."']/g, ""))
    .filter(Boolean)
    .map((part) => pyConst(part));
}

describe("protocole vocal — parité Python ≡ TypeScript", () => {
  it("les états de l'agent sont les mêmes des deux côtés", () => {
    expect([...AGENT_STATES].sort()).toEqual(pySet("AGENT_STATES").sort());
  });

  it("les codes d'erreur sont les mêmes des deux côtés", () => {
    expect([...AGENT_ERROR_CODES].sort()).toEqual(pySet("AGENT_ERROR_CODES").sort());
  });

  it("les événements client → worker sont les mêmes des deux côtés", () => {
    const fromTs = voiceEventSchema.options.map((o) => o.shape.type.value).sort();
    expect(fromTs).toEqual(pySet("CLIENT_EVENTS").sort());
  });

  it("les événements worker → client sont les mêmes des deux côtés", () => {
    const fromTs = agentEventSchema.options.map((o) => o.shape.type.value).sort();
    expect(fromTs).toEqual(pySet("AGENT_EVENTS").sort());
  });

  it("les rôles de texte sont les mêmes des deux côtés", () => {
    const fromPy = [pyConst("ROLE_USER"), pyConst("ROLE_AGENT")].sort();
    expect([...AGENT_TEXT_ROLES].sort()).toEqual(fromPy);
  });
});

describe("protocole vocal — comportement du récepteur", () => {
  it("accepte un état produit par le worker", () => {
    const parsed = agentEventSchema.parse({
      type: "agent_state",
      state: "thinking",
      turnId: "t12",
    });
    expect(parsed.type).toBe("agent_state");
  });

  it("accepte une transcription réelle et une réponse, via le rôle", () => {
    const heard = agentEventSchema.parse({
      type: "agent_text",
      text: "je veux mon permis",
      turnId: "t12",
      final: true,
      role: "user",
    });
    const reply = agentEventSchema.parse({
      type: "agent_text",
      text: "Il vous faut trois pièces.",
      turnId: "t12",
      final: true,
      role: "agent",
    });
    expect(heard.type === "agent_text" && heard.role).toBe("user");
    expect(reply.type === "agent_text" && reply.role).toBe("agent");
  });

  it("rejette un état inconnu : le client ne devine pas", () => {
    expect(() =>
      agentEventSchema.parse({ type: "agent_state", state: "reflecting" })
    ).toThrow();
  });

  it("rejette un code d'erreur inconnu", () => {
    expect(() =>
      agentEventSchema.parse({ type: "agent_error", code: "oops", message: "x" })
    ).toThrow();
  });

  it("rejette un texte sans rôle (impossible de savoir qui parle)", () => {
    expect(() =>
      agentEventSchema.parse({ type: "agent_text", text: "bonjour", final: true })
    ).toThrow();
  });

  it("n'accepte plus les anciens événements morts agent_speaking/agent_done", () => {
    // Ils étaient déclarés dans le schéma Zod mais n'étaient émis ni reçus par
    // personne. Les garder laisserait croire à un canal qui n'existe pas.
    for (const type of ["agent_speaking", "agent_done"]) {
      expect(() => agentEventSchema.parse({ type })).toThrow();
      expect(() => voiceEventSchema.parse({ type })).toThrow();
    }
  });
});
