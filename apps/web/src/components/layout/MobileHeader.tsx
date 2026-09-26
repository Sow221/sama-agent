/**
 * MobileHeader (§12) — back + titre + actions ; sur l'accueil : salutation + avatar.
 */
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar, IconButton } from "@/components/ui";
import { ArrowLeftIcon, MoreIcon } from "@/components/icons";
import { useAuth } from "@/lib/auth/auth-context";

const TITLES: Record<string, string> = {
  "/app/voice": "Nouvelle conversation",
  "/app/chats": "Chats",
  "/app/memory": "Mémoire",
  "/app/files": "Fichiers",
  "/app/actions": "Actions",
  "/app/search": "Recherche",
  "/app/you": "Moi",
};

export function MobileHeader() {
  const pathname = usePathname();
  const { user } = useAuth();
  const isHome = pathname === "/app/home";

  // Segment de navigation : /app/... ; les routes profondes gardent le retour.
  const title = Object.entries(TITLES)
    .filter(([prefix]) => pathname.startsWith(prefix))
    .sort((a, b) => b[0].length - a[0].length)[0]?.[1];
  const isDeep = (pathname.match(/\//g) ?? []).length > 2; // au-delà de /app/xxx

  if (isHome) {
    const first = (user?.email ?? "").split("@")[0];
    return (
      <header className="sticky top-0 z-sticky border-b border-border bg-[rgba(10,18,32,0.72)] backdrop-blur-xl md:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <p className="text-lg font-bold">
            Bonjour{first ? `, ${first.replace(/[._-].*$/, "")}` : ""}
          </p>
          <Link href="/app/you" aria-label="Mon profil">
            <Avatar name={user?.email ?? null} size="lg" />
          </Link>
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-sticky border-b border-border bg-[rgba(10,18,32,0.72)] backdrop-blur-xl md:hidden">
      <div className="mx-auto flex h-14 max-w-[480px] items-center justify-between px-2">
        <div className="flex min-w-0 items-center gap-1">
          {isDeep ? (
            <Link href="/app/chats" aria-label="Retour">
              <IconButton label="Retour" tabIndex={-1}>
                <ArrowLeftIcon className="h-5 w-5" />
              </IconButton>
            </Link>
          ) : null}
          <h1 className="truncate text-base font-bold text-text1">{title ?? "Sama Agent"}</h1>
        </div>
        <IconButton label="Plus d'options" tabIndex={-1}>
          <MoreIcon className="h-5 w-5" />
        </IconButton>
      </div>
    </header>
  );
}