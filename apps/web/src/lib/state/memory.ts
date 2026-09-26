/**
 * Spanme mémoire — Cahier §32-35, Blueprint §24/26.
 * Catégories réelles (You · Projets · Objectifs · Préférences · Important) ;
 * la « Sauvegarde » d'un élément vient d'une action explicite de l'utilisateur
 * (bouton Mémoriser de la conversation), jamais d'une promesse de fonction.
 * Persistance locale durable (localStorage) : la mémoire survit aux sessions.
 */
"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { useEffect, useState } from "react";

/** Storage no-op hors navigateur (SSR/prérendu) — règle commune à stores.ts. */
const noopLocalStorage: Storage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
  key: () => null,
  get length() {
    return 0;
  },
};

export type MemoryCategory = "you" | "projects" | "goals" | "preferences" | "important";

export const MEMORY_CATEGORY_LABEL: Record<MemoryCategory, string> = {
  you: "Vous",
  projects: "Projets",
  goals: "Objectifs",
  preferences: "Préférences",
  important: "Important",
};

export interface MemoryItem {
  id: string;
  text: string;
  category: MemoryCategory;
  createdAt: number;
}

interface MemoryState {
  items: MemoryItem[];
  add: (text: string, category?: MemoryCategory) => MemoryItem;
  remove: (id: string) => void;
  clear: () => void;
}

let memSeq = 0;

export const useMemoryStore = create<MemoryState>()(
  persist(
    (set) => ({
      items: [],
      add: (text, category = "important") => {
        const item: MemoryItem = {
          id: `mem-${Date.now()}-${++memSeq}`,
          text,
          category,
          createdAt: Date.now(),
        };
        set((s) => ({ items: [item, ...s.items] }));
        return item;
      },
      remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
      clear: () => set({ items: [] }),
    }),
    {
      name: "sama:memory",
      storage: createJSONStorage(() =>
        typeof window !== "undefined" ? localStorage : noopLocalStorage
      ),
      partialize: (s) => ({ items: s.items }),
    }
  )
);

/** L'hydratation persist arrive après le premier rendu (zustand v5). */
export function useMemoryHydrated(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let mounted = true;
    const mark = () => mounted && setReady(true);
    const unsubscribe = useMemoryStore.persist.onFinishHydration(mark);
    if (
      typeof useMemoryStore.persist.hasHydrated === "function" &&
      useMemoryStore.persist.hasHydrated()
    ) {
      mark();
    }
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);
  return ready;
}