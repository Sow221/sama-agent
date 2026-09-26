"use client";

/**
 * Conversations, tour d'agent et mémoire — état SERVEUR (TanStack Query).
 *
 * Avant : l'historique vivait dans un store de session (perdu au rechargement,
 * mélangé entre conversations), la réponse de l'agent était une phrase fixe
 * construite côté client, et la mémoire un localStorage que l'agent ne lisait
 * jamais. Le serveur expose tout cela (fastapi.py) : le front s'y branche.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client/client";
import type { MemoryKind } from "@/lib/schemas";

const KEYS = {
  conversations: ["conversations"] as const,
  conversation: (id: string) => ["conversation", id] as const,
  messages: (id: string) => ["conversation", id, "messages"] as const,
  memories: ["memories"] as const,
};

export function useConversations() {
  return useQuery({ queryKey: KEYS.conversations, queryFn: () => api.conversations() });
}

export function useConversation(id: string | undefined) {
  return useQuery({
    queryKey: KEYS.conversation(id ?? ""),
    queryFn: () => api.conversation(id as string),
    enabled: Boolean(id),
    retry: false,
  });
}

export function useMessages(id: string | undefined) {
  return useQuery({
    queryKey: KEYS.messages(id ?? ""),
    queryFn: () => api.messages(id as string),
    enabled: Boolean(id),
  });
}

export function useCreateConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { title?: string; journeyId?: string }) => api.createConversation(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.conversations }),
  });
}

export function useRenameConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => api.renameConversation(id, title),
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: KEYS.conversations });
      qc.setQueryData(KEYS.conversation(c.id), c);
    },
  });
}

export function useDeleteConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteConversation(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.conversations }),
  });
}

/** Tour d'agent : le serveur persiste les deux messages ; on relit l'historique. */
export function useAgentTurn(conversationId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { text: string; journeyId?: string }) =>
      api.agentTurn({ ...body, conversationId }),
    onSuccess: (r) => {
      if (conversationId) {
        qc.invalidateQueries({ queryKey: KEYS.messages(conversationId) });
        qc.invalidateQueries({ queryKey: KEYS.conversations });
      }
      if (r.newMemories.length) qc.invalidateQueries({ queryKey: KEYS.memories });
    },
  });
}

export function useMemories() {
  return useQuery({ queryKey: KEYS.memories, queryFn: () => api.memories() });
}

export function useCreateMemory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { kind: MemoryKind; content: string; source?: string; journeyId?: string }) =>
      api.createMemory(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.memories }),
  });
}

export function useDeleteMemory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteMemory(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.memories }),
  });
}

/** Libellés des types de mémoire serveur. */
export const MEMORY_KIND_LABEL: Record<MemoryKind, string> = {
  SELF: "Vous",
  PREFERENCE: "Préférence",
  FACT: "À retenir",
  TEMPORARY: "Temporaire",
  CONVERSATION: "Conversation",
};
