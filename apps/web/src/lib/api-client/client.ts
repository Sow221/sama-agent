/**
 * Client HTTP typé → API FastAPI du worker (D1 — architecture-code §4.1).
 * Chaque réponse est validée par le schéma Zod correspondant (ADR-007).
 */
import { z } from "zod";
import { newTraceId } from "@/lib/trace";
import { authBearerHeaders } from "@/lib/auth/supabase";
import {
  agentTurnResponseSchema,
  conversationMessageSchema,
  conversationSchema,
  memoryItemSchema,
  type AgentTurnResponse,
  type Conversation,
  type ConversationMessage,
  type MemoryKind,
  type ServerMemoryItem,
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

/** Exemple candidat de l'usine à données et ses contrôles automatiques (K1…). */
export const dataItemSchema = z.object({
  id: z.string(),
  kind: z.string(),
  textWo: z.string(),
  textFr: z.string().nullable(),
  hasAudio: z.boolean(),
  source: z.string(),
  checks: z.record(z.string(), z.unknown()),
  autoPass: z.boolean().nullable(),
  status: z.string(),
});
export type DataItem = z.infer<typeof dataItemSchema>;

export const dataStatsSchema = z.object({
  judged: z.number(),
  agreement: z.number().nullable(),
  precision: z.number().nullable(),
  target: z.number(),
  trusted: z.boolean(),
  pending: z.number(),
  accepted: z.number(),
  rejected: z.number(),
});
export type DataStats = z.infer<typeof dataStatsSchema>;

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

  /* ── Conversations (historique serveur, isolé par usager) ── */
  conversations(): Promise<Conversation[]> {
    return request("/api/conversations?limit=50", z.object({ items: z.array(conversationSchema) }))
      .then((r) => r.items);
  },
  conversation(id: string): Promise<Conversation> {
    return request(`/api/conversations/${encodeURIComponent(id)}`, conversationSchema);
  },
  createConversation(body: { title?: string; journeyId?: string }): Promise<Conversation> {
    return request("/api/conversations", conversationSchema, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  renameConversation(id: string, title: string): Promise<Conversation> {
    return request(`/api/conversations/${encodeURIComponent(id)}`, conversationSchema, {
      method: "PATCH",
      body: JSON.stringify({ title }),
    });
  },
  deleteConversation(id: string): Promise<unknown> {
    return request(`/api/conversations/${encodeURIComponent(id)}`, z.unknown(), { method: "DELETE" });
  },
  messages(conversationId: string): Promise<ConversationMessage[]> {
    return request(
      `/api/conversations/${encodeURIComponent(conversationId)}/messages?limit=200`,
      z.object({ items: z.array(conversationMessageSchema) })
    ).then((r) => r.items);
  },

  /** POST /api/agent/turn — tour réel : intent → dossier → réponse + mémoire + historique. */
  agentTurn(body: { text: string; journeyId?: string; conversationId?: string }): Promise<AgentTurnResponse> {
    return request("/api/agent/turn", agentTurnResponseSchema, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  /** POST /api/speak — la réponse redite en wolof + audio réel (voix Adia). */
  speakWolof(text: string): Promise<{ wolof: string; audio: string; mime: string }> {
    return request(
      "/api/speak",
      z.object({ wolof: z.string(), audio: z.string(), mime: z.string() }),
      { method: "POST", body: JSON.stringify({ text }) }
    );
  },

  /* ── Usine à données wolof (doc 11) — réservé aux étalons ── */
  datafactoryNext(n = 10): Promise<DataItem[]> {
    return request(`/api/datafactory/next?n=${n}`, z.object({ items: z.array(dataItemSchema) })).then(
      (r) => r.items
    );
  },

  datafactoryVerdict(body: { itemId: string; verdict: "ok" | "ko" | "edit"; correction?: string }): Promise<DataItem> {
    return request("/api/datafactory/verdict", dataItemSchema, { method: "POST", body: JSON.stringify(body) });
  },

  datafactoryStats(): Promise<{ me: DataStats; all: DataStats }> {
    return request("/api/datafactory/stats", z.object({ me: dataStatsSchema, all: dataStatsSchema }));
  },

  /** Audio d'un exemple (protégé) → URL locale lisible par un <audio>. */
  async datafactoryAudio(itemId: string): Promise<string> {
    const res = await fetch(`${API_URL}/api/datafactory/audio/${encodeURIComponent(itemId)}`, {
      headers: await authBearerHeaders(),
    });
    if (!res.ok) throw new ApiError(`audio ${itemId} → ${res.status}`, res.status);
    return URL.createObjectURL(await res.blob());
  },

  /* ── Mémoire long terme (serveur, purgeable) ── */
  memories(): Promise<ServerMemoryItem[]> {
    return request("/api/memory?limit=100", z.object({ items: z.array(memoryItemSchema) }))
      .then((r) => r.items);
  },
  createMemory(body: { kind: MemoryKind; content: string; source?: string; journeyId?: string }): Promise<ServerMemoryItem> {
    return request("/api/memory", memoryItemSchema, { method: "POST", body: JSON.stringify(body) });
  },
  deleteMemory(id: string): Promise<unknown> {
    return request(`/api/memory/${encodeURIComponent(id)}`, z.unknown(), { method: "DELETE" });
  },
};