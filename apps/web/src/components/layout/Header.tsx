"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Header() {
  const pathname = usePathname();
  return (
    <header className="flex items-center justify-between py-3">
      <Link href="/" className="focus-visible flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 via-blue-500 to-cyan-400 text-sm font-bold text-white">
          SA
        </span>
        <span className="text-lg font-semibold">Sama Agent</span>
      </Link>
      <Link
        href="/limites"
        className={`focus-visible text-sm ${pathname === "/limites" ? "text-primary" : "text-text2"}`}
      >
        Limites
      </Link>
    </header>
  );
}