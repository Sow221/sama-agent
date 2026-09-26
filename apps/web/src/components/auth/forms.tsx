"use client";

/**
 * Formulaires d'authentification RÉELLE (Supabase) — UI/UX Master Spec §18-22.
 * Login · Signup (nom+email+mdp) · Forgot (envoi du lien réel) · Reset (nouveau mdp) ·
 * Verify (boîte mail). En harnais (auth non configurée) : retour direct à l'espace.
 */
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthShell } from "./AuthShell";
import { Button, Input, Spinner } from "@/components/ui";
import { useAuth } from "@/lib/auth/auth-context";
import { isOnboardingDone } from "@/lib/auth/onboarding";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold text-text2">{label}</span>
      {children}
    </label>
  );
}

/** Après connexion réelle : onboarding si jamais fait, sinon l'espace. */
function usePostAuthRedirect() {
  const router = useRouter();
  const { configured, loading, session } = useAuth();
  useEffect(() => {
    if (configured && !loading && session) {
      router.replace(isOnboardingDone() ? "/app/home" : "/onboarding");
    } else if (!configured && !loading) {
      router.replace("/app/home");
    }
  }, [configured, loading, session, router]);
}

/* ═══════════════ Log in (§18) ═══════════════ */
export function LoginForm() {
  usePostAuthRedirect();
  const { signIn, signInWithGoogle } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy || email.trim().length < 3 || password.length < 6) return;
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de la connexion. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Bon retour"
      subtitle="Votre dossier vous attend."
      footer={
        <>
          Pas encore de compte ?{" "}
          <Link href="/signup" className="font-semibold text-primary">
            Créer un compte
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Adresse e-mail">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="adresse@exemple.sn"
            autoComplete="email"
            required
          />
        </Field>
        <Field label="Mot de passe">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Votre mot de passe"
            autoComplete="current-password"
            required
          />
        </Field>
        <div className="flex justify-end">
          <Link href="/forgot-password" className="focus-visible text-sm font-semibold text-accent-ai">
            Mot de passe oublié ?
          </Link>
        </div>
        {error ? (
          <p role="alert" className="rounded-lg border border-error/25 bg-error/10 px-3 py-2 text-sm text-error">
            {error}
          </p>
        ) : null}
        <Button type="submit" variant="gradient" size="lg" loading={busy} className="w-full">
          Se connecter
        </Button>
      </form>

      <div className="my-4 flex items-center gap-3 text-sm text-text-muted">
        <span className="h-px flex-1 bg-border" />
        ou
        <span className="h-px flex-1 bg-border" />
      </div>

      <Button type="button" variant="secondary" size="lg" className="w-full" onClick={() => signInWithGoogle()}>
        Continuer avec Google
      </Button>
    </AuthShell>
  );
}

/* ═══════════════ Sign up (§19) ═══════════════ */
export function SignupForm() {
  usePostAuthRedirect();
  const { signUp } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy || email.trim().length < 3 || password.length < 6) return;
    if (password !== confirm) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signUp(email.trim(), password, { name: name.trim() || undefined });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "La création du compte a échoué. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return <VerifyEmailNotice />;
  }

  return (
    <AuthShell
      title="Créer un compte"
      subtitle="Votre dossier vous appartient — seuls vos documents sont conservés."
      footer={
        <>
          Déjà inscrit ?{" "}
          <Link href="/login" className="font-semibold text-primary">
            Se connecter
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Nom (optionnel)">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Votre nom"
            autoComplete="name"
          />
        </Field>
        <Field label="Adresse e-mail">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="adresse@exemple.sn"
            autoComplete="email"
            required
          />
        </Field>
        <Field label="Mot de passe">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="6 caractères minimum"
            autoComplete="new-password"
            required
          />
        </Field>
        <Field label="Confirmer le mot de passe">
          <Input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Même mot de passe"
            autoComplete="new-password"
            required
          />
        </Field>
        {error ? (
          <p role="alert" className="rounded-lg border border-error/25 bg-error/10 px-3 py-2 text-sm text-error">
            {error}
          </p>
        ) : null}
        <Button type="submit" variant="gradient" size="lg" loading={busy} className="w-full">
          Créer mon compte
        </Button>
        <p className="text-xs text-text-muted">
          Si la confirmation d'e-mail est activée, vous recevrez un lien de vérification avant la première connexion.
        </p>
      </form>
    </AuthShell>
  );
}

/* ═══════════════ Forgot password (§20) ═══════════════ */
export function ForgotForm() {
  const { configured, loading, resetPassword } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!configured && !loading) router.replace("/app/home");
  }, [configured, loading, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy || email.trim().length < 3) return;
    setBusy(true);
    setError(null);
    try {
      await resetPassword(email.trim());
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "L'envoi a échoué. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Mot de passe oublié"
      subtitle="Saisissez votre e-mail : nous vous envoyons un lien de réinitialisation."
      footer={
        <Link href="/login" className="font-semibold text-primary">
          ← Retour à la connexion
        </Link>
      }
    >
      {sent ? (
        <div role="status" className="flex flex-col gap-2 rounded-lg border border-success/30 bg-success/10 p-4 text-sm">
          <p className="font-semibold text-success">Lien envoyé.</p>
          <p className="text-text2">
            Vérifiez votre boîte mail (dossier spam compris) puis suivez le lien pour choisir un nouveau mot de passe.
          </p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Field label="Adresse e-mail">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="adresse@exemple.sn"
              autoComplete="email"
              required
            />
          </Field>
          {error ? (
            <p role="alert" className="rounded-lg border border-error/25 bg-error/10 px-3 py-2 text-sm text-error">
              {error}
            </p>
          ) : null}
          <Button type="submit" variant="gradient" size="lg" loading={busy} className="w-full">
            Envoyer le lien
          </Button>
        </form>
      )}
    </AuthShell>
  );
}

/* ═══════════════ Reset password (§22) ═══════════════ */
export function ResetForm() {
  const { configured, loading, updatePassword } = useAuth();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!configured && !loading) router.replace("/app/home");
  }, [configured, loading, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy || password.length < 6) return;
    if (password !== confirm) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updatePassword(password);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "La mise à jour a échoué. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Nouveau mot de passe"
      subtitle="Choisissez un mot de passe de 6 caractères minimum."
      footer={
        <Link href="/login" className="font-semibold text-primary">
          ← Retour à la connexion
        </Link>
      }
    >
      {done ? (
        <div role="status" className="flex flex-col gap-3 rounded-lg border border-success/30 bg-success/10 p-4 text-sm">
          <p className="font-semibold text-success">Mot de passe mis à jour.</p>
          <Link href="/login">
            <Button variant="secondary" className="w-full">
              Se connecter
            </Button>
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Field label="Nouveau mot de passe">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="6 caractères minimum" autoComplete="new-password" required />
          </Field>
          <Field label="Confirmer">
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Même mot de passe" autoComplete="new-password" required />
          </Field>
          {error ? (
            <p role="alert" className="rounded-lg border border-error/25 bg-error/10 px-3 py-2 text-sm text-error">
              {error}
            </p>
          ) : null}
          <Button type="submit" variant="gradient" size="lg" loading={busy} className="w-full">
            Enregistrer
          </Button>
        </form>
      )}
    </AuthShell>
  );
}

/* ═══════════════ Verify e-mail (§21) ═══════════════ */
function VerifyEmailNotice() {
  return (
    <AuthShell
      title="Vérifiez votre boîte mail"
      subtitle="Nous avons envoyé un lien de confirmation à votre adresse e-mail."
      footer={
        <Link href="/login" className="font-semibold text-primary">
          ← Revenir à la connexion
        </Link>
      }
    >
      <div role="status" className="flex flex-col items-center gap-4 rounded-lg border border-accent-soft bg-accent-soft/30 p-6 text-center">
        <span aria-hidden className="text-4xl">
          📬
        </span>
        <p className="text-sm text-text2">
          Cliquez sur le lien reçu pour activer votre compte, puis connectez-vous. Sans confirmation
          reçue, vérifiez votre dossier spam ou renouvelez l'opération d'inscription.
        </p>
        <Button type="button" variant="secondary" className="w-full" loading={false}>
          <Link href="/login">J'ai vérifié — me connecter</Link>
        </Button>
      </div>
    </AuthShell>
  );
}

export function VerifyScreen() {
  return <VerifyEmailNotice />;
}

/** État de chargement auth pendant la vérification de session. */
export function AuthBusy({ label = "Chargement…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-text2">
      <Spinner />
      <p className="text-sm">{label}</p>
    </div>
  );
}