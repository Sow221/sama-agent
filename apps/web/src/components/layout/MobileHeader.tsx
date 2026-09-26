/**
 * MobileHeader (§12) — retour + titre + aide ; sur l'accueil : salutation + avatar.
 * Le titre et l'écran parent viennent de la table unique `lib/routes.ts`.
 * Le titre de page (h1) appartient à chaque écran : ici, un simple libellé.
 */
"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Avatar, IconButton } from "@/components/ui";
import { ArrowLeftIcon, InfoIcon } from "@/components/icons";
import { useAuth } from "@/lib/auth/auth-context";
import { routeInfo } from "@/lib/routes";

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
      <header className="sticky top-0 z-sticky border-b border-border bg-[rgba(10,18,32,0.72)] backdrop-blur-xl md:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <p className="text-lg font-bold">{first ? `Bonjour, ${first}` : "Bonjour"}</p>
          <Link href="/app/you" aria-label="Mon profil" className="focus-visible rounded-full">
            <Avatar name={first ?? user?.email ?? null} size="lg" />
          </Link>
        </div>
      </header>
    );
  }

  const parent = info?.parent?.(pathname, new URLSearchParams(search.toString()));

  return (
    <header className="sticky top-0 z-sticky border-b border-border bg-[rgba(10,18,32,0.72)] backdrop-blur-xl md:hidden">
      <div className="mx-auto flex h-14 max-w-[480px] items-center justify-between px-2">
        <div className="flex min-w-0 items-center gap-1">
          {parent ? (
            <Link href={parent} aria-label="Retour" className="focus-visible rounded-full">
              <IconButton label="Retour" tabIndex={-1}>
                <ArrowLeftIcon className="h-5 w-5" />
              </IconButton>
            </Link>
          ) : (
            <span className="w-2" />
          )}
          <p className="truncate text-base font-bold text-text1">{info?.title ?? "Sama Agent"}</p>
        </div>
        <Link href="/limits" aria-label="Aide et limites" className="focus-visible rounded-full">
          <IconButton label="Aide et limites" tabIndex={-1}>
            <InfoIcon className="h-5 w-5" />
          </IconButton>
        </Link>
      </div>
    </header>
  );
}
