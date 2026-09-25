/**
 * AuthProvider + useAuth — état de session Supabase (identité réelle).
 * Modèle : subscription à onAuthStateChange (une seule source de vérité) ;
 * `flow` injectable pour les tests (jamais de réseau en Vitest).
 */
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { isAuthConfigured, supabaseAuthFlow, type SupabaseAuth } from "./supabase";

export interface AuthValue {
  /** L'authentification est-elle exigée (Supabase configuré) ? */
  configured: boolean;
  /** Session en cours de chargement (premier rendu). */
  loading: boolean;
  session: Session | null;
  user: Session["user"] | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({
  children,
  flow,
}: {
  children: ReactNode;
  /** Injectable pour les tests ; par défaut le flux Supabase réel. */
  flow?: SupabaseAuth | null;
}) {
  const auth = useMemo(() => (flow === undefined ? supabaseAuthFlow() : flow), [flow]);
  const configured = isAuthConfigured();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(configured);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }
    let mounted = true;
    auth.getSession().then((s) => {
      if (mounted) {
        setSession(s);
        setLoading(false);
      }
    });
    const unsubscribe = auth.onAuthStateChange((s) => {
      setSession(s);
      setLoading(false);
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [auth]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (auth) await auth.signInWithPassword(email, password);
    },
    [auth]
  );
  const signUp = useCallback(
    async (email: string, password: string) => {
      if (auth) await auth.signUp(email, password);
    },
    [auth]
  );
  const signInWithGoogle = useCallback(async () => {
    if (auth) await auth.signInWithGoogle(`${window.location.origin}/`);
  }, [auth]);
  const signOut = useCallback(async () => {
    if (auth) await auth.signOut();
  }, [auth]);

  const value = useMemo<AuthValue>(
    () => ({
      configured,
      loading,
      session,
      user: session?.user ?? null,
      signIn,
      signUp,
      signInWithGoogle,
      signOut,
    }),
    [configured, loading, session, signIn, signUp, signInWithGoogle, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé sous <AuthProvider>");
  return ctx;
}