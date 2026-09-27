"use client";

/**
 * AuthShell — carte centrée 420–460px (UI/UX Master Spec §18-19).
 * L'écran reste visuellement calme : marque, titre, carte, pied de page.
 */
import type { ReactNode } from "react";

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
  return (
    <section className="container-page flex min-h-[calc(100dvh-4.5rem)] flex-col justify-center gap-6 py-8">
      <div className="text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary via-[#0ab8a0] to-accent-ai text-base font-extrabold text-[#04211a] shadow-glow">
          SA
        </span>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-2 text-sm text-text2">{subtitle}</p> : null}
      </div>
      <div className="rounded-card border border-border bg-white/[0.05] p-5 backdrop-blur-xl sm:p-6">
        {children}
      </div>
      {footer ? <p className="text-center text-sm text-text2">{footer}</p> : null}
    </section>
  );
}