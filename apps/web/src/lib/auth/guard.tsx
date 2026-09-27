"use client";

/**
 * AuthGate — garde des routes protégées (identité réelle).
 * - Supabase non configuré (harnais/dév local) : on laisse passer, l'identité de
 *   service du worker s'applique (comme SAMA_MODE=deterministic).
 * - Configuré (production) : pas de session → redirection vers /login?next=<page demandée>.
 *
 * ⚠ Ce garde affichait un spinner INDÉFINIMENT quand la lecture de session
 * échouait (le `loading` restait bloqué, cf. `sessionError` dans auth-context).
 * L'usager n'avait ni message, ni action, ni diagnostic. Une garde-fou dont
 * l'échec est invisible n'est pas une garde-fou : on nomme l'échec et on propose
 * de réessayer, ce qui est la seule action possible ici.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button, Spinner } from "@/components/ui";
import { useAuth } from "./auth-context";
import { rememberNext } from "./next";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { configured, loading, session, sessionError } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (configured && !loading && !session && !sessionError) {
      // On garde la page demandée : après connexion, l'usager y revient.
      const here = window.location.pathname + window.location.search;
      rememberNext(here);
      router.replace(`/login?next=${encodeURIComponent(here)}`);
    }
  }, [configured, loading, session, sessionError, router]);

  if (!configured) return <>{children}</>;
  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  // Échec de lecture de session : on ne redirige PAS vers /auth — cela
  // laisserait croire à une session absente alors qu'on n'a pas su le vérifier,
  // et l'usager resterait prisonnier d'une boucle. On affiche l'échec.
  if (sessionError) {
    return (
      <div
        role="alert"
        data-testid="auth-session-error"
        className="mx-auto flex max-w-md flex-col items-start gap-3 p-8"
      >
        <p className="text-base font-semibold text-warning">{sessionError}</p>
        <p className="text-sm text-text2">
          Le service d&apos;authentification n&apos;a pas répondu. Votre dossier est
          intact ; il s&apos;agit seulement de la vérification de session.
        </p>
        <Button variant="secondary" onClick={() => window.location.reload()}>
          Réessayer
        </Button>
      </div>
    );
  }

  if (!session) return null; // redirection en cours
  return <>{children}</>;
}
