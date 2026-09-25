"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";

export function Header() {
  const pathname = usePathname();
  const { configured, loading, session, signOut } = useAuth();

  return (
    <header className="sticky top-0 z-30 border-b border-surface-2 bg-[rgba(10,18,32,0.72)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-[480px] items-center justify-between px-4 py-3">
        <Link href={session ? "/app" : "/"} className="focus-visible flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary via-[#0ab8a0] to-accent-ai text-sm font-extrabold text-[#04211a] shadow-glow">
            SA
          </span>
          <span className="text-lg font-bold tracking-tight">
            Sama <span className="text-gradient">Agent</span>
          </span>
        </Link>

        <div className="flex items-center gap-3">
          <Link
            href="/limits"
            className={`focus-visible rounded-full px-3 py-1 text-sm ${
              pathname === "/limits"
                ? "bg-primary/15 font-semibold text-primary"
                : "text-text2"
            }`}
          >
            Limites
          </Link>

          {configured && session ? (
            <div className="flex items-center gap-2">
              <span
                className="hidden max-w-[9rem] truncate text-sm text-text2 sm:inline"
                title={session.user.email ?? ""}
              >
                {session.user.email}
              </span>
              <button
                type="button"
                onClick={() => signOut()}
                className="focus-visible rounded-full border border-surface-2 bg-surface px-3 py-1 text-sm text-text2 hover:text-text1"
              >
                Déconnexion
              </button>
            </div>
          ) : configured && !loading ? (
            <Link
              href="/auth"
              className="focus-visible rounded-full bg-primary/15 px-3 py-1 text-sm font-semibold text-primary"
            >
              Connexion
            </Link>
          ) : null}
        </div>
      </div>
    </header>
  );
}