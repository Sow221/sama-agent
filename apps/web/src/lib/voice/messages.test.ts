import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api-client/client";
import { agentErrorMessage, voiceFailure } from "./messages";

function domError(name: string): Error {
  const e = new Error("technical");
  e.name = name;
  return e;
}

describe("voiceFailure", () => {
  it("409 : pas de dossier → proposer de commencer un parcours", () => {
    const f = voiceFailure(new ApiError('API /api/voice/token → 409 : {"detail":"aucun dossier"}', 409));
    expect(f.remedy).toBe("start_journey");
    expect(f.message).not.toMatch(/detail|409|API/);
  });

  it("micro absent / refusé : message français, jamais le nom technique", () => {
    expect(voiceFailure(domError("NotFoundError")).message).toMatch(/Aucun micro/);
    expect(voiceFailure(domError("NotAllowedError")).remedy).toBe("allow_mic");
    expect(voiceFailure(domError("NotFoundError")).message).not.toMatch(/Requested device/);
  });

  it("503 : service vocal non configuré → continuer par écrit", () => {
    expect(voiceFailure(new ApiError("x", 503)).remedy).toBe("text");
  });
});

describe("agentErrorMessage", () => {
  it("traduit chaque code du worker, et replie un code inconnu", () => {
    expect(agentErrorMessage("asr_unavailable")).toMatch(/reconnaissance vocale/);
    expect(agentErrorMessage("inconnu")).toMatch(/n'a pas pu traiter/);
  });
});
