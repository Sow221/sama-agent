"use client";

/**
 * Préférences locales (`sama:prefs`) — UI/UX Master Spec §20 Préférences.
 * Uniquement des choix d'interface (voix, style, langue) : jamais de données
 * métier. Persistées dans localStorage, réinitialisables.
 */
import { useCallback, useEffect, useState } from "react";

const KEY = "sama:prefs";

type Prefs = Record<string, boolean | string>;

function read(): Prefs {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Prefs) : {};
  } catch {
    return {};
  }
}

function write(next: Prefs) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(next));
}

/** Préférence binaire (toggle). */
export function useBoolPref(key: string, defaultValue: boolean) {
  const [value, setValue] = useState<boolean>(defaultValue);
  useEffect(() => {
    const stored = read()[key];
    if (typeof stored === "boolean") setValue(stored);
  }, [key]);
  const toggle = useCallback(() => {
    setValue((v) => {
      const next = !v;
      write({ ...read(), [key]: next });
      return next;
    });
  }, [key]);
  return [value, toggle] as const;
}

/** Préférence à valeurs multiples (choix). */
export function useEnumPref<T extends string>(key: string, defaultValue: T) {
  const [value, setValue] = useState<T>(defaultValue);
  useEffect(() => {
    const stored = read()[key];
    if (typeof stored === "string") setValue(stored as T);
  }, [key]);
  const set = useCallback(
    (next: T) => {
      setValue(next);
      write({ ...read(), [key]: next });
    },
    [key]
  );
  return [value, set] as const;
}