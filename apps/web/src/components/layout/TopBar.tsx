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
import { routeInfo } from "@/lib/routes";

export function TopBar() {
  const pathname = usePathname();
  const { user } = useAuth();

  const title = routeInfo(pathname)?.title;

  return (
    <header className="sticky top-0 z-sticky hidden border-b border-border bg-[rgba(10,18,32,0.72)] backdrop-blur-xl md:block">
      <div className="flex h-16 items-center justify-between gap-4 px-6">
        <p className="truncate text-base font-bold text-text1">{title ?? "Sama Agent"}</p>
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