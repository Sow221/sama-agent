/**
 * Contrats Sama Agent (miroir serveur) — référence : panning/spec-types-ts-zod.md (ADR-007)
 * Serveur : Pydantic (services/worker) — Front : Zod (ici). Les deux partagent les mêmes enums (ADR-006).
 * Convention : camelCase partout (ADR-007).
 */
import { z } from "zod";
import {
  DOCUMENT_STATUS,
  DOCUMENT_TYPE,
  INTENT,
  INTENT_ACTION,
  JOURNEY_STATUS,
  LANGUAGE,
  NEXT_ACTION,
} from "@sama/shared/gen/enums";

/* ── Entrée ─────────────────────────────────────────────── */

export const intentRequestSchema = z
  .object({
    /** Retranscription réelle (ASR via voix, ou saisie texte) */
    transcript: z.string().min(1),
    /** Langue de l'utilisateur : wo (voix) ou fr (texte) */
    language: z.enum(LANGUAGE).optional(),
    context: z
      .object({
        journeyId: z.string().optional(),
        stepId: z.string().optional(),
      })
      .optional(),
  })
  .strict();
export type IntentRequest = z.infer<typeof intentRequestSchema>;

const journeyDocumentInputSchema = z
  .object({
    requirementId: z.string(),
    name: z.string().optional(),
    status: z.enum(DOCUMENT_STATUS),
  })
  .strict();

export const journeyRequestSchema = z
  .object({
    journeyId: z.string().min(1),
    procedureId: z.string().optional(),
    documents: z.array(journeyDocumentInputSchema).optional(),
    /* G3 : la completion est TOUJOURS dérivée par le moteur, jamais envoyée brute.
       Le contrat est strict : tout champ inconnu (dont completion) est rejeté. */
  })
  .strict();
export type JourneyRequest = z.infer<typeof journeyRequestSchema>;

export const analyzeRequestSchema = z.object({
  requirementId: z.string(),
  journeyId: z.string(),
  /* Fichier réel envoyé en multipart (image/pdf) — jamais d'analyse simulée */
  file: z.instanceof(File).optional(),
});
export type AnalyzeRequest = z.infer<typeof analyzeRequestSchema>;

/* ── Sorties ────────────────────────────────────────────── */

export const intentResponseSchema = z.object({
  intent: z.enum(INTENT),
  action: z.enum(INTENT_ACTION),
  language: z.enum(LANGUAGE),
  confidence: z.number().min(0).max(1),
  needsClarification: z.boolean(),
  clarificationQuestion: z.string().nullish(),
  transcript: z.string().nullish(),
});
export type IntentResponse = z.infer<typeof intentResponseSchema>;

export const documentAnalysisSchema = z.object({
  requirementId: z.string(),
  status: z.enum(DOCUMENT_STATUS),
  /* ANALYZED = conforme à l'élément attendu (jamais "VALIDATED_BY_AI", G11) */
  matchedType: z.enum(DOCUMENT_TYPE).nullish(),
  confidence: z.number().min(0).max(1).nullish(),
  reason: z.string().nullish(),
  fileName: z.string().nullish(),
  /* G11 : observations factuelles de la vision + recommandation (pas une certification) */
  observations: z.array(z.string()),
  requiresHumanReview: z.boolean(),
});
export type DocumentAnalysis = z.infer<typeof documentAnalysisSchema>;

export const journeyDocumentSchema = z.object({
  requirementId: z.string(),
  name: z.string(),
  status: z.enum(DOCUMENT_STATUS),
});
export type JourneyDocument = z.infer<typeof journeyDocumentSchema>;

export const journeyStepSchema = z.object({
  id: z.string(),
  name: z.string(),
  order: z.number().int().positive(),
  status: z.enum(["done", "active", "todo"]),
});
export type JourneyStep = z.infer<typeof journeyStepSchema>;

export const completionSchema = z.object({
  provided: z.number().int().nonnegative(),
  required: z.number().int().positive(),
  ratio: z.number().min(0).max(1),
});
export type Completion = z.infer<typeof completionSchema>;

export const journeyResponseSchema = z.object({
  journeyId: z.string(),
  procedureId: z.string(),
  status: z.enum(JOURNEY_STATUS),
  steps: z.array(journeyStepSchema),
  completion: completionSchema,
  documents: z.array(journeyDocumentSchema),
  nextAction: z.enum(NEXT_ACTION).nullish(),
  nextActionRequirement: z.string().nullish(),
  /* label + raison dérivés par le moteur (source unique enums.json) — jamais reconstruits ici */
  nextActionLabel: z.string().nullish(),
  nextActionReason: z.string().nullish(),
});
export type JourneyResponse = z.infer<typeof journeyResponseSchema>;

export const evidenceSchema = z.object({
  requirement: z.string(),
  procedureId: z.string(),
  source: z.string(),
  sourceUrl: z.string().nullish(),
  description: z.string(),
  limitations: z.array(z.string()),
});
export type Evidence = z.infer<typeof evidenceSchema>;

/* ── Réel-temps (DataChannel LiveKit) ──────────────────────────
   Miroir exact de `services/worker/agent/voice/protocol.py`. Les deux côtés
   listent les mêmes noms d'événements et les mêmes `turnId` ; un test de parité
   (`voice.test.ts`) compare les listes, donc un ajout d'un côté casse l'autre.

   Le canal est désormais BIDIRECTIONNEL. Avant, seul le client parlait
   (`barge_in`/`user_segment`/`cancel`) et le worker ne répondait jamais : le front
   devait donc inventer l'état (« Je vous écoute… » en dur) et ne pouvait jamais
   afficher la transcription réelle. `agent_speaking`/`agent_done` existaient
   dans le schéma mais n'étaient émis par personne — c'est-à-dire que personne
   ne les écoutait.                                    */

/** Client → worker */
export const voiceEventBase = {
  barge_in: z.object({ type: z.literal("barge_in") }),
  user_segment: z.object({
    type: z.literal("user_segment"),
    segmentId: z.string(),
    /* durée du segment audio publié (ms) */
    durationMs: z.number().int().nonnegative(),
  }),
  cancel: z.object({ type: z.literal("cancel"), turnId: z.string().optional() }),
} as const;

export const voiceEventSchema = z.discriminatedUnion("type", [
  voiceEventBase.barge_in,
  voiceEventBase.user_segment,
  voiceEventBase.cancel,
]);
export type VoiceEvent = z.infer<typeof voiceEventSchema>;

/* Worker → client */

export const AGENT_STATES = ["listening", "thinking", "speaking"] as const;
export const agentStateSchema = z.enum(AGENT_STATES);
export type AgentState = z.infer<typeof agentStateSchema>;

export const AGENT_ERROR_CODES = [
  "asr_unavailable",
  "tts_unavailable",
  "no_journey",
  "unknown_room",
  "turn_failed",
] as const;
export const agentErrorCodeSchema = z.enum(AGENT_ERROR_CODES);
export type AgentErrorCode = z.infer<typeof agentErrorCodeSchema>;

export const AGENT_TEXT_ROLES = ["user", "agent"] as const;
export const agentTextRoleSchema = z.enum(AGENT_TEXT_ROLES);
export type AgentTextRole = z.infer<typeof agentTextRoleSchema>;

export const agentEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("agent_state"),
    state: agentStateSchema,
    turnId: z.string().nullable().optional(),
  }),
  z.object({
    type: z.literal("agent_text"),
    text: z.string(),
    turnId: z.string().nullable().optional(),
    final: z.boolean(),
    /* `user` = transcription ASR réelle, `agent` = réponse du moteur. */
    role: agentTextRoleSchema,
  }),
  z.object({
    type: z.literal("agent_error"),
    code: agentErrorCodeSchema,
    message: z.string(),
    turnId: z.string().nullable().optional(),
  }),
]);
export type AgentEvent = z.infer<typeof agentEventSchema>;

/** `POST /api/voice/token` — le dossier et la room sont explicites. */
export const voiceTokenSchema = z.object({
  url: z.string(),
  token: z.string(),
  journeyId: z.string(),
  room: z.string(),
  identity: z.string(),
  ttl: z.number().int().positive(),
});
export type VoiceToken = z.infer<typeof voiceTokenSchema>;