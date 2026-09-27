/**
 * Top bar web (§11) — 64px, desktop uniquement (mobile → MobileHeader).
 * Gauche : retour vers l'écran parent logique (écrans profonds) + titre.
 * Droite : « Parler » (la voix est l'action centrale : sans ce bouton, elle
 * n'était accessible sur ordinateur que depuis l'accueil), recherche, profil.
 * L'aide est dans la barre latérale (zone utilité).
 * Liens stylés directement : pas de <button> imbriqué dans un <a>.
 */
"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Avatar } from "@/components/ui";
import { ArrowLeftIcon, Mic, SearchIcon } from "@/components/icons";
import { useAuth } from "@/lib/auth/auth-context";
import { routeInfo } from "@/lib/routes";
import { cn } from "@/lib/cn";

const ICON_LINK =
  "focus-visible flex h-11 w-11 items-center justify-center rounded-full text-text2 transition-colors duration-micro hover:bg-surface-hover hover:text-text1";

export function TopBar() {
  const pathname = usePathname();
  const search = useSearchParams();
  const { user } = useAuth();

  const info = routeInfo(pathname);
  const parent = info?.parent?.(pathname, new URLSearchParams(search.toString()));
  const inVoice = pathname.startsWith("/app/voice");

  return (
    <header className="sticky top-0 z-sticky hidden border-b border-border bg-[rgba(17,17,15,0.72)] backdrop-blur-xl md:block">
      <div className="flex h-16 items-center justify-between gap-4 px-6 lg:px-10">
        <div className="flex min-w-0 items-center gap-2">
          {parent ? (
            <Link href={parent} aria-label="Retour" title="Retour" className={cn(ICON_LINK, "-ml-3")}>
              <ArrowLeftIcon className="h-5 w-5" />
            </Link>
          ) : null}
          <p className="truncate text-base font-bold text-text1">{info?.title ?? "Sama Agent"}</p>
        </div>
        <div className="flex items-center gap-1">
          {!inVoice ? (
            <Link
              href="/app/voice"
              className="focus-visible mr-2 inline-flex min-h-10 items-center gap-2 rounded-full bg-gradient-to-r from-primary to-accent-ai px-4 text-sm font-semibold text-[#11110f] shadow-glow transition-transform duration-micro active:scale-[0.97]"
            >
              <Mic className="h-4 w-4" />
              Parler
            </Link>
          ) : null}
          <Link href="/app/search" aria-label="Rechercher" title="Rechercher" className={ICON_LINK}>
            <SearchIcon className="h-5 w-5" />
          </Link>
          <Link href="/app/you" aria-label="Mon profil" title="Mon profil" className={ICON_LINK}>
            <Avatar name={user?.email ?? null} size="sm" />
          </Link>
        </div>
      </div>
    </header>
  );
}
