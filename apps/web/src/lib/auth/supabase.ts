/**
 * Client Supabase (Auth) — identité RÉELLE des usagers (email/mot de passe + Google).
 *
 * La connexion est OBLIGATOIRE par défaut (NEXT_PUBLIC_SUPABASE_URL +
 * NEXT_PUBLIC_SUPABASE_ANON_KEY). Seul le harnais explicite
 * (NEXT_PUBLIC_SAMA_HARNESS=1, tests / dév local) ouvre l'espace avec l'identité
 * de SERVICE du worker — comme SAMA_MODE=deterministic côté serveur. Chaque appel
 * API porte `Authorization: Bearer <access_token>`.
 */
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/**
 * Mode harnais (tests automatisés, développement local SANS compte) : doit être
 * DEMANDÉ explicitement avec NEXT_PUBLIC_SAMA_HARNESS=1.
 *
 * ⚠ Avant, l'absence des clés Supabase suffisait à ouvrir l'espace à tout le
 * monde : un déploiement où l'on avait oublié les variables (ex. Vercel) donnait
 * accès à l'app SANS connexion. Désormais l'app est fermée par défaut : sans clés
 * et sans harnais explicite, la connexion est exigée et signalée indisponible.
 */
export function isHarness(): boolean {
  return process.env.NEXT_PUBLIC_SAMA_HARNESS === "1";
}

/** Message affiché quand la connexion est exigée mais que Supabase n'est pas configuré. */
export const AUTH_NOT_CONFIGURED =
  "La connexion est momentanément indisponible : le service d'authentification n'est pas configuré sur ce déploiement.";

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

/** Forme minimale de la lecture de session, pour permettre l'injection en test. */
export type SessionReader = () => Promise<{
  session: { access_token?: string } | null;
}>;

/** Lecteur réel : la session Supabase du navigateur. */
const supabaseSession: SessionReader = async () => {
  const { data } = await getSupabase().auth.getSession();
  return { session: (data.session as { access_token?: string } | null) ?? null };
};

/**
 * ⚠ `getSession()` est ici aussi sans garde-fou, et le défaut était plus large
 * qu'un écran bloqué : une lecture de session qui échoue faisait REJETER
 * `authBearerHeaders`, donc `request()` échouait AVANT même d'appeler `fetch`.
 * Résultat : une Supabase instable rendait cassées *toutes* les requêtes API
 * de l'application, y compris celles qui n'exigent pas d'authentification. La
 * cause invisible (Supabase) transformait en panne totale du produit.
 *
 * On distingue donc deux situations, qui n'appellent pas la même décision :
 *  - l'utilisateur est connecté  → on joint son jeton ;
 *  - on n'a pas pu le savoir      → on joint RIEN.
 * Le worker tranche alors lui-même (401 si la route l'exige, sinon 200 en
 * identité de service). C'est au serveur de refuser, pas au client de deviner.
 *
 * `readSession` est injectable pour que cette garantie soit vérifiable sans
 * navigateur ni réseau.
 */
export async function authBearerHeaders(
  readSession: SessionReader = supabaseSession
): Promise<Record<string, string>> {
  if (!isAuthConfigured()) return {};
  try {
    const { session } = await readSession();
    return session?.access_token ? { authorization: `Bearer ${session.access_token}` } : {};
  } catch {
    // Lecture impossible : on poursuit sans jeton plutôt que de tout casser.
    return {};
  }
}

/** Flux d'authentification partagé (AuthProvider — voir auth-context.tsx). */
export interface SupabaseAuth {
  getSession: () => Promise<Session | null>;
  onAuthStateChange: (cb: (session: Session | null) => void) => () => void;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, options?: { name?: string }) => Promise<void>;
  signInWithGoogle: (redirectTo: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Mot de passe oublié (§20) — envoie un lien réel de réinitialisation. */
  resetPassword?: (email: string) => Promise<void>;
  /** Nouveau mot de passe depuis /reset-password (§22). */
  updatePassword?: (newPassword: string) => Promise<void>;
}

const noopUnsubscribe = () => {};

/** Messages d'erreur d'authentification en français (les codes Supabase restent vrais). */
const FRENCH_AUTH_ERRORS: Record<string, string> = {
  invalid_credentials: "E-mail ou mot de passe incorrect.",
  email_not_confirmed: "Adresse e-mail non confirmée. Vérifiez votre boîte mail.",
  over_email_send_rate_limit: "Trop de messages envoyés récemment. Réessayez dans quelques minutes.",
  user_already_exists: "Un compte existe déjà avec cette adresse e-mail.",
  weak_password: "Mot de passe trop faible (6 caractères minimum).",
  same_password: "Le nouveau mot de passe doit être différent de l'ancien.",
  provider_disabled: "Cette méthode de connexion n'est pas disponible.",
};

export function frenchAuthError(error: unknown): Error {
  if (error instanceof Error) {
    const code = (error as { code?: string }).code;
    if (code && FRENCH_AUTH_ERRORS[code]) return new Error(FRENCH_AUTH_ERRORS[code]);
    const msg = error.message;
    if (msg === "Invalid login credentials") return new Error("E-mail ou mot de passe incorrect.");
    if (msg === "Email not confirmed") return new Error("Adresse e-mail non confirmée. Vérifiez votre boîte mail.");
    if (msg === "User already registered") return new Error("Un compte existe déjà avec cette adresse e-mail.");
    if (/rate limit|too .* request/i.test(msg)) {
      return new Error("Trop de tentatives récentes. Réessayez dans quelques minutes.");
    }
    // Réseau coupé / service d'authentification injoignable (fetch rejeté).
    if (/failed to fetch|network|load failed|fetch failed/i.test(msg) || error.name === "AuthRetryableFetchError") {
      return new Error("Connexion au service impossible. Vérifiez votre réseau, puis réessayez.");
    }
    return error;
  }
  return new Error("Une erreur est survenue. Réessayez.");
}

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
      if (error) throw frenchAuthError(error);
    },
    async signUp(email, password, options) {
      const { error } = await sb.auth.signUp({
        email,
        password,
        options: { data: options?.name ? { full_name: options.name } : undefined },
      });
      if (error) throw frenchAuthError(error);
    },
    async signInWithGoogle(redirectTo) {
      // Provider actuellement désactivé dans le projet Supabase (external.google=false) :
      // le bouton n'est plus affiché (§99 — pas de promesse sans fonctionnalité).
      const { error } = await sb.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
      if (error) throw frenchAuthError(error);
    },
    async signOut() {
      await sb.auth.signOut();
    },
    async resetPassword(email) {
      const { error } = await sb.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw frenchAuthError(error);
    },
    async updatePassword(newPassword) {
      const { error } = await sb.auth.updateUser({ password: newPassword });
      if (error) throw frenchAuthError(error);
    },
  };
}