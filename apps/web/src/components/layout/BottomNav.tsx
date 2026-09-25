"use client";

/**
 * BottomNav (ADR-008) : barre basse avec FAB micro au centre.
 * FAB : pulsation lente (idle), clic → scale 0.95 + retour haptique + plein écran voix.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mic } from "@/components/icons";
import { useJourneyStore } from "@/lib/state/stores";
import { memo } from "react";

export const BottomNav = memo(function BottomNav() {
  const pathname = usePathname();
  const inVoice = pathname.startsWith("/app/voice");
  // Le lien Dossier pointe sur LE dossier de l'usager (journeyId par-usager),
  // jamais vers un identifiant partagé (appropriation serveur journeys.user_id).
  const journeyId = useJourneyStore((s) => s.response?.journeyId);
  const dossierHref = journeyId ? `/app/dossier/${journeyId}` : "/app";

  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[rgba(10,18,32,0.82)] backdrop-blur-xl"
    >
      <div className="mx-auto flex max-w-[480px] items-center justify-between px-6 pb-[max(env(safe-area-inset-bottom),12px)] pt-3">
        <NavItem href="/app" label="Accueil" active={pathname === "/app"} emoji="🏠" />
        <Link
          href="/app/voice"
          aria-label="Parler à Sama Agent"
          onPointerDown={(e) => {
            const el = e.currentTarget;
            el.style.transform = "scale(0.95)";
            if ("vibrate" in navigator) navigator.vibrate(10);
          }}
          onPointerUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
          className={`focus-visible relative -mt-8 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary via-[#0ab8a0] to-accent-ai text-[#04211a] shadow-glow transition-transform ${
            inVoice ? "opacity-50" : "animate-pulse-slow"
          }`}
        >
          {!inVoice ? (
            <>
              <span className="ring-pulse absolute inset-0 rounded-full border-2 border-accent-ai/50" />
              <span
                className="ring-pulse absolute inset-0 rounded-full border border-primary/60"
                style={{ animationDelay: "1.1s" }}
              />
            </>
          ) : null}
          <Mic className="h-7 w-7" />
        </Link>
        <NavItem
          href={dossierHref}
          label="Dossier"
          active={pathname.startsWith("/app/dossier")}
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