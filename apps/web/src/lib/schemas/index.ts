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

/* ── Réel-temps (DataChannel LiveKit) ───────────────────── */

export const voiceEventBase = {
  barge_in: z.object({ type: z.literal("barge_in") }),
  user_segment: z.object({
    type: z.literal("user_segment"),
    segmentId: z.string(),
    /* durée du segment audio publié (ms) */
    durationMs: z.number().int().nonnegative(),
  }),
  agent_speaking: z.object({ type: z.literal("agent_speaking") }),
  agent_done: z.object({ type: z.literal("agent_done") }),
  cancel: z.object({ type: z.literal("cancel") }),
} as const;

export const voiceEventSchema = z.discriminatedUnion("type", [
  voiceEventBase.barge_in,
  voiceEventBase.user_segment,
  voiceEventBase.agent_speaking,
  voiceEventBase.agent_done,
  voiceEventBase.cancel,
]);
export type VoiceEvent = z.infer<typeof voiceEventSchema>;