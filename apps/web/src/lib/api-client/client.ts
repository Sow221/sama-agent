/**
 * Client HTTP typé → API FastAPI du worker (D1 — architecture-code §4.1).
 * Chaque réponse est validée par le schéma Zod correspondant (ADR-007).
 */
import { z } from "zod";
import { newTraceId } from "@/lib/trace";
import { authBearerHeaders } from "@/lib/auth/supabase";
import {
  documentAnalysisSchema,
  evidenceSchema,
  intentResponseSchema,
  journeyResponseSchema,
  voiceTokenSchema,
  type DocumentAnalysis,
  type Evidence,
  type IntentResponse,
  type JourneyResponse,
  type VoiceToken,
} from "@/lib/schemas";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly requestId?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  init?: RequestInit
): Promise<T> {
  const requestId = newTraceId();
  // Authentification réelle : Bearer <access_token Supabase> si session active
  // (rien à joindre en harnais — l'identité de service du worker s'applique).
  const auth = await authBearerHeaders();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "x-request-id": requestId,
      ...(init?.body instanceof FormData
        ? {}
        : { "content-type": "application/json" }),
      ...auth,
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    // 401 → événement système « session expirée » (§44), écouté par AppSystemUI.
    if (res.status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new Event("sama:unauthorized"));
    }
    const detail = await res.text().catch(() => "");
    throw new ApiError(
      `API ${path} → ${res.status}${detail ? ` : ${detail.slice(0, 200)}` : ""}`,
      res.status,
      requestId
    );
  }

  const json = await res.json();
  return schema.parse(json);
}

export const api = {
  /** POST /api/intent — comprend la demande (contexte facultatif : dossier en cours) */
  intent(
    transcript: string,
    language?: "fr" | "wo",
    context?: { journeyId?: string; stepId?: string }
  ): Promise<IntentResponse> {
    return request("/api/intent", intentResponseSchema, {
      method: "POST",
      body: JSON.stringify({ transcript, language, context }),
    });
  },

  /** POST /api/journey — moteur déterministe (completion TOUJOURS dérivée, G3) */
  journey(body: unknown): Promise<JourneyResponse> {
    return request("/api/journey", journeyResponseSchema, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  /** GET /api/journey/:id — reprise de dossier : l'état vient du SERVEUR (source de vérité),
   *  jamais reconstruit depuis le navigateur (référence §7.3). */
  resume(journeyId: string): Promise<JourneyResponse> {
    return request(`/api/journey/${encodeURIComponent(journeyId)}`, journeyResponseSchema);
  },

  /** POST /api/documents/analyze — vision réelle sur le fichier envoyé */
  analyze(form: FormData): Promise<DocumentAnalysis> {
    return request("/api/documents/analyze", documentAnalysisSchema, {
      method: "POST",
      body: form,
    });
  },

  /** GET /api/evidence/:requirement — preuve officielle + limites (C §66) */
  evidence(requirement: string): Promise<Evidence> {
    return request(`/api/evidence/${encodeURIComponent(requirement)}`, evidenceSchema);
  },

  /**
   * POST /api/voice/token — jeton LiveKit réel pour UN dossier.
   * `journeyId` est optionnel : à défaut, l'API reprend le dossier de l'usager.
   * Le serveur répond 503 (clés LiveKit absentes) ou 409 (aucun dossier) plutôt
   * que de signer un jeton vers une room fantôme : le front peut donc afficher
   * un message honnête au lieu d'échouer plus tard, sans explication.
   */
  voiceToken(journeyId?: string): Promise<VoiceToken> {
    return request("/api/voice/token", voiceTokenSchema, {
      method: "POST",
      body: JSON.stringify(journeyId ? { journeyId } : {}),
    });
  },
};