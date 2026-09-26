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
import { readSessionOnce, SESSION_UNAVAILABLE } from "./session-bootstrap";

export interface AuthValue {
  /** L'authentification est-elle exigée (Supabase configuré) ? */
  configured: boolean;
  /** Session en cours de chargement (premier rendu). */
  loading: boolean;
  session: Session | null;
  user: Session["user"] | null;
  /**
   * Échec de la lecture de session, s'il y en a eu un.
   *
   * ⚠ Ce champ n'existait pas. `getSession()` était appelé SANS `catch` : dès
   * qu'il rejetait — configuration Supabase incohérente, réseau bloqué, clé
   * révoquée — `loading` restait `true` DÉFINITIVEMENT. `AuthGate` rendait alors
   * son spinner pour toujours, sur toutes les pages, sans message et sans moyen
   * d'agir. Constaté en e2e : l'app entière réduite à « chargement ».
   * On distingue maintenant « pas de session » (état normal) de « impossible
   * de savoir » (état d'erreur, affiché).
   */
  sessionError: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, options?: { name?: string }) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Mot de passe oublié (§20). */
  resetPassword: (email: string) => Promise<void>;
  /** Nouveau mot de passe (§22). */
  updatePassword: (newPassword: string) => Promise<void>;
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
  const [sessionError, setSessionError] = useState<string | null>(null);

  useEffect(() => {
    // Harnais : rien à lire, l'identité de service du worker s'applique.
    if (!auth) {
      setLoading(false);
      return;
    }
    let mounted = true;

    // `readSessionOnce` ne rejette jamais : c'est la garantie qui empêche le
    // blocage définitif du spinner décrit sur `sessionError`. Si un jour cette
    // garantie saute, le `.catch` ci-dessous évite à nouveau le deadlock.
    readSessionOnce(auth).then(
      ({ session: s, error }) => {
        if (!mounted) return;
        setSession(s);
        setSessionError(error);
        setLoading(false);
      },
      () => {
        if (!mounted) return;
        setSessionError(SESSION_UNAVAILABLE);
        setLoading(false);
      }
    );

    // Abonnement TEMPS RÉEL aux changements de session. Un `onAuthStateChange`
    // qui échoue ne doit pas empêcher la lecture ci-dessus de faire son travail.
    let unsubscribe = () => {};
    try {
      unsubscribe = auth.onAuthStateChange((s) => {
        if (!mounted) return;
        setSession(s);
        setSessionError(null);
        setLoading(false);
      });
    } catch {
      /* on garde la lecture initiale : l'app reste utilisable */
    }
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
    async (email: string, password: string, options?: { name?: string }) => {
      if (auth) await auth.signUp(email, password, options);
    },
    [auth]
  );
  const signInWithGoogle = useCallback(async () => {
    if (auth) await auth.signInWithGoogle(`${window.location.origin}/`);
  }, [auth]);
  const signOut = useCallback(async () => {
    if (auth) await auth.signOut();
  }, [auth]);
  const resetPassword = useCallback(
    async (email: string) => {
      if (auth) await auth.resetPassword?.(email);
    },
    [auth]
  );
  const updatePassword = useCallback(
    async (newPassword: string) => {
      if (auth) await auth.updatePassword?.(newPassword);
    },
    [auth]
  );

  const value = useMemo<AuthValue>(
    () => ({
      configured,
      loading,
      session,
      sessionError,
      user: session?.user ?? null,
      signIn,
      signUp,
      signInWithGoogle,
      signOut,
      resetPassword,
      updatePassword,
    }),
    [
      configured,
      loading,
      session,
      sessionError,
      signIn,
      signUp,
      signInWithGoogle,
      signOut,
      resetPassword,
      updatePassword,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé sous <AuthProvider>");
  return ctx;
}