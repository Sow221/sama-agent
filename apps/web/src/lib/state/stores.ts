/**
 * Stores Zustand (D4) — état local : journney, dossier, chat, voix.
 * Les données serveur passent par TanStack Query ; ici uniquement l'état UI/éphémère.
 */
"use client";

import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { useEffect, useState } from "react";
import type {
  Completion,
  DocumentAnalysis,
  JourneyResponse,
} from "@/lib/schemas";

/** Storage no-op quand window est absent (SSR/prérendu) — sessionStorage sinon. */
const noopStorage: StateStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

function sessionSafe(): StateStorage {
  return typeof window !== "undefined" ? sessionStorage : noopStorage;
}

export type VoicePhase = "connecting" | "idle" | "listening" | "thinking" | "speaking";
export type MessageRole = "agent" | "user";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  text: string;
  /** Phase de traitement associée (agent thinking…) */
  pending?: boolean;
}

/* ── journeyStore : résultat du moteur déterministe ── */
interface JourneyState {
  response: JourneyResponse | null;
  setResponse: (r: JourneyResponse) => void;
  clear: () => void;
}

export const useJourneyStore = create<JourneyState>()(
  persist(
    (set) => ({
      response: null,
      setResponse: (response) => set({ response }),
      clear: () => set({ response: null }),
    }),
    {
      name: "sama:journey",
      // Le dossier de la session survit à un rechargement (scénario démo réel, point 25).
      storage: createJSONStorage(sessionSafe),
      partialize: (s) => ({ response: s.response }),
    }
  )
);

/* ── dossierStore : analyses réelles reçues pour le dossier ── */
interface DossierState {
  analyses: Record<string, DocumentAnalysis>;
  setAnalysis: (requirementId: string, a: DocumentAnalysis) => void;
}

export const useDossierStore = create<DossierState>()(
  persist(
    (set) => ({
      analyses: {},
      setAnalysis: (requirementId, analysis) =>
        set((s) => ({ analyses: { ...s.analyses, [requirementId]: analysis } })),
    }),
    {
      name: "sama:dossier",
      storage: createJSONStorage(sessionSafe),
      partialize: (s) => ({ analyses: s.analyses }),
    }
  )
);

/**
 * zustand v5 : l'hydratation persist arrive APRÈS le premier rendu. Les pages ne
 * décident de refetcher qu'une fois les stores hydratés — sinon un effet « vide »
 * écraserait un dossier porteur d'analyses (point 6, dossier de session réel).
 */
export function usePersistReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let mounted = true;
    const mark = () => {
      if (mounted) setReady(true);
    };
    const unsubs = [
      useJourneyStore.persist.onFinishHydration(mark),
      useDossierStore.persist.onFinishHydration(mark),
    ];
    if (
      typeof useJourneyStore.persist.hasHydrated === "function" &&
      typeof useDossierStore.persist.hasHydrated === "function" &&
      useJourneyStore.persist.hasHydrated() &&
      useDossierStore.persist.hasHydrated()
    ) {
      mark();
    }
    return () => {
      mounted = false;
      unsubs.forEach((u) => u());
    };
  }, []);
  return ready;
}

/* ── chatStore : conversation textuelle (écran Conversation) ── */
interface ChatState {
  messages: ChatMessage[];
  addMessage: (m: Omit<ChatMessage, "id">) => void;
  setPending: (pending: boolean) => void;
  clear: () => void;
}

let msgSeq = 0;
export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  addMessage: (m) => set((s) => ({ messages: [...s.messages, { ...m, id: `msg-${++msgSeq}` }] })),
  setPending: (pending) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.pending ? { ...m, pending } : m)),
    })),
  clear: () => set({ messages: [] }),
}));

/* ── voiceStore : phase + état de la session vocale réelle ── */
interface VoiceState {
  phase: VoicePhase;
  active: boolean;
  connected: boolean;
  segmentId: string | null;
  setPhase: (p: VoicePhase) => void;
  setActive: (a: boolean) => void;
  setConnected: (c: boolean) => void;
  startSegment: () => string;
  endSegment: () => void;
  reset: () => void;
}

export const useVoiceStore = create<VoiceState>((set) => ({
  phase: "idle",
  active: false,
  connected: false,
  segmentId: null,
  setPhase: (phase) => set({ phase }),
  setActive: (active) => set({ active }),
  setConnected: (connected) => set({ connected }),
  startSegment: () => {
    const segmentId = `seg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    set({ segmentId, phase: "listening", active: true });
    return segmentId;
  },
  endSegment: () => set({ segmentId: null }),
  reset: () => set({ phase: "idle", active: false, connected: false, segmentId: null }),
}));

/* ── completion dérivée (G3) : helper partagé, jamais stockée brute ── */
export function deriveCompletion(provided: number, required: number): Completion {
  const safeRequired = Math.max(1, required);
  return {
    provided,
    required: safeRequired,
    ratio: Math.min(1, provided / safeRequired),
  };
}