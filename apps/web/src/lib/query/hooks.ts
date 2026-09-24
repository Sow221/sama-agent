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
    mutationFn: ({ transcript, language }: { transcript: string; language?: "fr" | "wo" }) =>
      api.intent(transcript, language),
    onSuccess,
  });
}

export function useJourneyMutation(onSuccess: (r: JourneyResponse) => void) {
  return useMutation({
    mutationFn: (body: unknown) => api.journey(body),
    onSuccess,
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