/**
 * Top bar web (§11) — 64px : titre de section, recherche, compte.
 * Desktop uniquement (mobile → MobileHeader).
 */
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar, IconButton } from "@/components/ui";
import { SearchIcon } from "@/components/icons";
import { useAuth } from "@/lib/auth/auth-context";

const TITLES: Record<string, string> = {
  "/app/home": "Accueil",
  "/app/voice": "Voix",
  "/app/chats": "Chats",
  "/app/memory": "Mémoire",
  "/app/files": "Fichiers",
  "/app/actions": "Actions",
  "/app/search": "Recherche",
  "/app/you": "Moi",
  "/limits": "Limites",
};

export function TopBar() {
  const pathname = usePathname();
  const { user } = useAuth();

  const title = Object.entries(TITLES)
    .filter(([prefix]) => pathname.startsWith(prefix))
    .sort((a, b) => b[0].length - a[0].length)[0]?.[1];

  return (
    <header className="sticky top-0 z-sticky hidden border-b border-border bg-[rgba(10,18,32,0.72)] backdrop-blur-xl md:block">
      <div className="flex h-16 items-center justify-between gap-4 px-6">
        <h1 className="truncate text-base font-bold text-text1">{title ?? "Sama Agent"}</h1>
        <div className="flex items-center gap-1">
          <Link href="/app/search" aria-label="Rechercher">
            <IconButton label="Rechercher" tabIndex={-1}>
              <SearchIcon className="h-5 w-5" />
            </IconButton>
          </Link>
          <Link href="/app/you" aria-label="Mon profil">
            <IconButton label="Mon profil" tabIndex={-1}>
              <Avatar name={user?.email ?? null} size="sm" />
            </IconButton>
          </Link>
        </div>
      </div>
    </header>
  );
}