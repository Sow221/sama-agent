"use client";

/**
 * AuthShell — carte centrée 420–460px (UI/UX Master Spec §18-19).
 * L'écran reste visuellement calme : marque, titre, carte, pied de page.
 */
import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { BrandTile } from "@/components/brand/Logo";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { authUnavailable } = useAuth();
  return (
    <section className="container-page flex min-h-[calc(100dvh-4.5rem)] flex-col justify-center gap-6 py-8">
      <div className="text-center">
        <BrandTile size={48} className="mx-auto" />
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-2 text-sm text-text2">{subtitle}</p> : null}
      </div>
      {authUnavailable ? (
        <p role="alert" className="rounded-card border border-warning/40 bg-warning/10 p-4 text-sm text-text1">
          {authUnavailable}
        </p>
      ) : null}
      <div className="rounded-card border border-border bg-surface p-5 backdrop-blur-xl sm:p-6">
        {children}
      </div>
      {footer ? <p className="text-center text-sm text-text2">{footer}</p> : null}
    </section>
  );
}