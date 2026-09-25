"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";

export function Header() {
  const pathname = usePathname();
  const { configured, loading, session, signOut } = useAuth();

  return (
    <header className="flex items-center justify-between py-3">
      <Link href="/" className="focus-visible flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 via-blue-500 to-cyan-400 text-sm font-bold text-white">
          SA
        </span>
        <span className="text-lg font-semibold">Sama Agent</span>
      </Link>

      <div className="flex items-center gap-3">
        <Link
          href="/limits"
          className={`focus-visible text-sm ${
            pathname === "/limits" ? "text-primary" : "text-text2"
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
          <Link href="/auth" className="focus-visible text-sm font-semibold text-primary">
            Connexion
          </Link>
        ) : null}
      </div>
    </header>
  );
}