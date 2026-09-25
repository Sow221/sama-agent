"use client";

/**
 * Écran Auth — connexion / création de compte (email + mot de passe) et
 * « Continuer avec Google » (Supabase Auth). L'identité est RÉELLE : le session
 * Supabase alimente chaque appel API via `Authorization: Bearer <access_token>`.
 * Sans session, AuthGate refuse l'accès aux écrans du parcours (groupe (app)).
 */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ThinkingDots } from "@/components/ui";
import { useAuth } from "@/lib/auth/auth-context";

type Mode = "signin" | "signup";

export default function AuthPage() {
  const router = useRouter();
  const { configured, loading, session, signIn, signUp, signInWithGoogle } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Auth non configurée (harnais) : pas d'écran de connexion.
  useEffect(() => {
    if (!configured && !loading) router.replace("/");
  }, [configured, loading, router]);

  // Déjà connecté : on rentre dans l'espace.
  useEffect(() => {
    if (session) router.replace("/app");
  }, [session, router]);

  const submitDisabled = useMemo(
    () => busy || email.trim().length < 3 || password.length < 6,
    [busy, email, password]
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitDisabled) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "signin") {
        await signIn(email.trim(), password);
        // le changement de session déclenche la redirection
      } else {
        await signUp(email.trim(), password);
        if (!session) {
          setNotice(
            "Compte créé. Vérifiez votre boîte mail pour activer votre compte (si la confirmation est activée), puis connectez-vous."
          );
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de l'opération. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  async function onGoogle() {
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "La connexion Google a échoué. Réessayez."
      );
    }
  }

  return (
    <section className="mx-auto flex max-w-md flex-col gap-6 pt-8">
      <div className="text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary via-[#0ab8a0] to-accent-ai text-base font-extrabold text-[#04211a] shadow-glow">
          SA
        </span>
        <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-semibold uppercase tracking-widest text-accent-ai">
          <span className="inline-block h-2 w-2 rounded-full bg-primary animate-pulse" />
          Votre dossier, rien que pour vous
        </p>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight">
          {mode === "signin" ? "Connexion" : "Créer un compte"}
        </h1>
        <p className="mt-2 text-sm text-text2">
          Chaque parcours est enregistré sur votre compte — seuls vos documents vous
          appartiennent.
        </p>
      </div>

      <div className="rounded-card border border-white/10 bg-white/[0.05] p-5 backdrop-blur-xl">
        <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant={mode === "signin" ? "primary" : "ghost"}
            onClick={() => {
              setMode("signin");
              setError(null);
              setNotice(null);
            }}
          >
            Connexion
          </Button>
          <Button
            type="button"
            variant={mode === "signup" ? "primary" : "ghost"}
            onClick={() => {
              setMode("signup");
              setError(null);
              setNotice(null);
            }}
          >
            Créer un compte
          </Button>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="adresse@exemple.sn"
            aria-label="Adresse e-mail"
            autoComplete="email"
            className="focus-visible w-full rounded-2xl bg-surface border border-surface-2 p-4 text-base text-text1 placeholder:text-text2"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mot de passe (6 caractères min.)"
            aria-label="Mot de passe"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            className="focus-visible w-full rounded-2xl bg-surface border border-surface-2 p-4 text-base text-text1 placeholder:text-text2"
          />
          <Button type="submit" variant="gradient" disabled={submitDisabled}>
            {busy ? <ThinkingDots label="Connexion…" /> : mode === "signin" ? "Se connecter" : "Créer mon compte"}
          </Button>
        </form>

        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p role="status" className="text-sm text-primary">
            {notice}
          </p>
        ) : null}

        <div className="flex items-center gap-3 text-sm text-text2">
          <span className="h-px flex-1 bg-surface-2" />
          ou
          <span className="h-px flex-1 bg-surface-2" />
        </div>

        <Button type="button" variant="ghost" onClick={onGoogle} className="w-full">
          Continuer avec Google
        </Button>
        </div>
      </div>
    </section>
  );
}