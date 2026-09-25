/**
 * Client Supabase (Auth) — identité RÉELLE des usagers (email/mot de passe + Google).
 *
 * L'authentification n'est active que si le projet Supabase est configuré
 * (NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY). Sans configuration
 * (développement local / harnais), l'app fonctionne avec l'identité de SERVICE du
 * worker — exactement comme SAMA_MODE=deterministic côté serveur. En production
 * (Brev, clés présentes), la connexion est obligatoire et chaque appel API porte
 * `Authorization: Bearer <access_token>`.
 */
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** Vrai uniquement si le projet Supabase est configuré (production/démo). */
export function isAuthConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

let _client: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (!_client) {
    if (!isAuthConfigured()) {
      // Configuration absente : mode harnais (l'identité de service du worker suffit).
      throw new Error("Supabase non configuré — NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY manquants");
    }
    _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return _client;
}

/** En-têtes d'autorisation à joindre aux appels API — vides si auth non configurée. */
export async function authBearerHeaders(): Promise<Record<string, string>> {
  if (!isAuthConfigured()) return {};
  const { data } = await getSupabase().auth.getSession();
  return data.session?.access_token
    ? { authorization: `Bearer ${data.session.access_token}` }
    : {};
}

/** Flux d'authentification partagé (AuthProvider — voir auth-context.tsx). */
export interface SupabaseAuth {
  getSession: () => Promise<Session | null>;
  onAuthStateChange: (cb: (session: Session | null) => void) => () => void;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInWithGoogle: (redirectTo: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const noopUnsubscribe = () => {};

export function supabaseAuthFlow(): SupabaseAuth | null {
  if (!isAuthConfigured()) return null;
  const sb = getSupabase();
  return {
    async getSession() {
      const { data } = await sb.auth.getSession();
      return data.session;
    },
    onAuthStateChange(cb) {
      const { data } = sb.auth.onAuthStateChange((_event, session) => cb(session));
      return () => data.subscription.unsubscribe();
    },
    async signInWithPassword(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    async signUp(email, password) {
      const { error } = await sb.auth.signUp({ email, password });
      if (error) throw error;
    },
    async signInWithGoogle(redirectTo) {
      const { error } = await sb.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
      if (error) throw error;
    },
    async signOut() {
      await sb.auth.signOut();
    },
  };
}