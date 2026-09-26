/**
 * Hooks TanStack Query (D4) — accès typés à l'API worker.
 */
"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client/client";
import type {
  DocumentAnalysis,
  Evidence,
  IntentResponse,
  JourneyResponse,
} from "@/lib/schemas";

export function useIntentMutation(onSuccess: (r: IntentResponse) => void) {
  return useMutation({
    mutationFn: ({
      transcript,
      language,
      context,
    }: {
      transcript: string;
      language?: "fr" | "wo";
      context?: { journeyId?: string; stepId?: string };
    }) => api.intent(transcript, language, context),
    onSuccess,
  });
}

export function useJourneyMutation(onSuccess: (r: JourneyResponse) => void) {
  return useMutation({
    mutationFn: (body: unknown) => api.journey(body),
    onSuccess,
  });
}

/**
 * Reprise de dossier (GET /api/journey/:id) — la source de vérité est le SERVEUR
 * (référence §7.3) : l'état vient de journeys + journey_requirements, jamais du
 * navigateur. 404 (parcours non encore persisté) → les pages basculent sur le POST.
 */
export function useJourneyResume(journeyId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["journey", journeyId, "resume"],
    queryFn: (): Promise<JourneyResponse> => api.resume(journeyId as string),
    enabled: Boolean(journeyId && enabled),
    retry: false,
  });
}

export function useAnalyzeMutation() {
  return useMutation({
    mutationFn: (form: FormData): Promise<DocumentAnalysis> => api.analyze(form),
  });
}

export function useEvidence(requirement: string | undefined | null) {
  return useQuery({
    queryKey: ["evidence", requirement],
    queryFn: (): Promise<Evidence> => api.evidence(requirement as string),
    enabled: Boolean(requirement),
  });
}

export function useVoiceToken() {
  return useQuery({
    queryKey: ["voice-token"],
    queryFn: () => api.voiceToken(),
    enabled: false,
  });
}