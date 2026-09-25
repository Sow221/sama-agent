/**
 * AuthGate — garde des routes protégées (identité réelle).
 * - Supabase non configuré (harnais/dév local) : on laisse passer, l'identité de
 *   service du worker s'applique (comme SAMA_MODE=deterministic).
 * - Configuré (production) : pas de session → redirection vers /auth.
 */
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui";
import { useAuth } from "./auth-context";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { configured, loading, session } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (configured && !loading && !session) router.replace("/auth");
  }, [configured, loading, session, router]);

  if (!configured) return <>{children}</>;
  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }
  if (!session) return null; // redirection en cours
  return <>{children}</>;
}