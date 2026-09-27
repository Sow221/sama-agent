/**
 * MobileHeader (§12) — retour + titre + aide ; sur l'accueil : salutation + avatar.
 * Le titre et l'écran parent viennent de la table unique `lib/routes.ts`.
 * Le titre de page (h1) appartient à chaque écran : ici, un simple libellé.
 */
"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Avatar } from "@/components/ui";
import { ArrowLeftIcon, InfoIcon } from "@/components/icons";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { useAuth } from "@/lib/auth/auth-context";
import { routeInfo } from "@/lib/routes";

const ICON_LINK =
  "focus-visible flex h-11 w-11 items-center justify-center rounded-full text-text2 transition-colors duration-micro hover:bg-surface-hover hover:text-text1";

/** Prénom affichable : nom saisi à l'inscription, sinon rien (jamais « ? »). */
function firstName(user: ReturnType<typeof useAuth>["user"]): string | null {
  const meta = (user?.user_metadata ?? {}) as { name?: string; full_name?: string };
  const name = (meta.name || meta.full_name || "").trim();
  return name ? name.split(/\s+/)[0] : null;
}

export function MobileHeader() {
  const pathname = usePathname();
  const search = useSearchParams();
  const { user } = useAuth();
  const info = routeInfo(pathname);

  if (pathname === "/app/home") {
    const first = firstName(user);
    return (
      <header className="sticky top-0 z-sticky border-b border-border bg-bar-bg backdrop-blur-xl md:hidden">
        <div className="flex items-center justify-between gap-2 px-4 py-3 sm:px-6">
          <p className="min-w-0 truncate text-lg font-bold">{first ? `Bonjour, ${first}` : "Bonjour"}</p>
          <div className="flex shrink-0 items-center">
            <ThemeToggle />
            <Link href="/app/you" aria-label="Mon profil" className="focus-visible rounded-full">
              <Avatar name={first ?? user?.email ?? null} size="lg" />
            </Link>
          </div>
        </div>
      </header>
    );
  }

  const parent = info?.parent?.(pathname, new URLSearchParams(search.toString()));

  return (
    <header className="sticky top-0 z-sticky border-b border-border bg-bar-bg backdrop-blur-xl md:hidden">
      <div className="flex h-14 items-center justify-between gap-2 px-2 sm:px-4">
        <div className="flex min-w-0 items-center gap-1">
          {parent ? (
            <Link href={parent} aria-label="Retour" title="Retour" className={ICON_LINK}>
              <ArrowLeftIcon className="h-5 w-5" />
            </Link>
          ) : (
            <span className="w-2" />
          )}
          <p className="truncate text-base font-bold text-text1">{info?.title ?? "Sama Agent"}</p>
        </div>
        <div className="flex shrink-0 items-center">
          <ThemeToggle />
          <Link href="/app/you/help" aria-label="Aide" title="Aide" className={ICON_LINK}>
            <InfoIcon className="h-5 w-5" />
          </Link>
        </div>
      </div>
    </header>
  );
}
