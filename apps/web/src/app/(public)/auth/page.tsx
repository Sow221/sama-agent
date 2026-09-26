"use client";

/**
 * `/auth` — alias de connexion (compat : liens historiques + batterie e2e).
 * Le parcours officiel passe par /login et /signup.
 */
import { LoginForm } from "@/components/auth/forms";

export default function AuthAliasPage() {
  return <LoginForm />;
}