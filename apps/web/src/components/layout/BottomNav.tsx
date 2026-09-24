"use client";

/**
 * BottomNav (ADR-008) : barre basse avec FAB micro au centre.
 * FAB : pulsation lente (idle), clic → scale 0.95 + retour haptique + plein écran voix.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mic } from "@/components/icons";
import { memo } from "react";

export const BottomNav = memo(function BottomNav() {
  const pathname = usePathname();
  const inVoice = pathname.startsWith("/voice");

  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-surface-2 bg-[rgba(10,18,32,0.85)] backdrop-blur-lg"
    >
      <div className="mx-auto flex max-w-[480px] items-center justify-between px-6 pb-[max(env(safe-area-inset-bottom),12px)] pt-3">
        <NavItem href="/" label="Accueil" active={pathname === "/"} emoji="🏠" />
        <Link
          href="/voice"
          aria-label="Parler à Sama Agent"
          onPointerDown={(e) => {
            const el = e.currentTarget;
            el.style.transform = "scale(0.95)";
            if ("vibrate" in navigator) navigator.vibrate(10);
          }}
          onPointerUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
          className={`focus-visible relative -mt-8 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 via-blue-500 to-cyan-400 text-white shadow-glow transition-transform ${
            inVoice ? "opacity-50" : "animate-pulse-slow"
          }`}
        >
          <Mic className="h-7 w-7" />
        </Link>
        <NavItem
          href="/dossier/driving_license_new"
          label="Dossier"
          active={pathname.startsWith("/dossier")}
          emoji="📁"
        />
      </div>
    </nav>
  );
});

function NavItem({
  href,
  label,
  active,
  emoji,
}: {
  href: string;
  label: string;
  active: boolean;
  emoji: string;
}) {
  return (
    <Link
      href={href}
      className={`focus-visible flex flex-col items-center gap-1 rounded-xl px-3 py-1 text-sm ${
        active ? "text-primary" : "text-text2"
      }`}
    >
      <span className="text-lg leading-none">{emoji}</span>
      <span>{label}</span>
    </Link>
  );
}