/**
 * BottomNav mobile — UI/UX Master Spec §3.1, §79.
 * 4 destinations fixes : Accueil · Chats · Mémoire · Moi.
 * Le Voice Core est l'ACTION centrale, jamais un 5ᵉ onglet (§3.1).
 * Visible sur mobile uniquement ; masqué en plein écran voix.
 */
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChatIcon, HomeIcon, MemoryIcon, Mic, UserIcon } from "@/components/icons";
import { cn } from "@/lib/cn";
import { memo } from "react";

function routeIsActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

const ITEMS = [
  { href: "/app/home", label: "Accueil", icon: HomeIcon },
  { href: "/app/chats", label: "Chats", icon: ChatIcon },
  { href: "/app/memory", label: "Mémoire", icon: MemoryIcon },
  { href: "/app/you", label: "Moi", icon: UserIcon },
] as const;

export const BottomNav = memo(function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const inVoice = pathname.startsWith("/app/voice");
  if (inVoice) return null;

  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-bottom-nav border-t border-border bg-bottom-nav-bg backdrop-blur-xl md:hidden"
    >
      <div className="mx-auto flex max-w-[480px] items-end justify-between px-3 pb-[max(env(safe-area-inset-bottom),8px)] pt-2">
        {ITEMS.slice(0, 2).map(({ href, label, icon: Icon }) => {
          const active = routeIsActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "focus-visible flex h-14 w-14 flex-col items-center justify-center gap-1 rounded-xl text-xs font-medium transition-colors duration-micro",
                active ? "text-primary" : "text-text-muted"
              )}
            >
              <span className="rounded-full px-3 py-1" style={{ background: active ? "var(--primary-soft)" : undefined }}>
                <Icon className="h-5 w-5" />
              </span>
              <span className={cn(active && "font-semibold")}>{label}</span>
            </Link>
          );
        })}

        {/* Voice Core — action centrale */}
        <button
          type="button"
          aria-label="Parler à Sama Agent"
          onClick={() => router.push("/app/voice")}
          onPointerDown={(e) => {
            e.currentTarget.style.transform = "scale(0.95)";
            if ("vibrate" in navigator) navigator.vibrate(10);
          }}
          onPointerUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
          className="focus-visible relative -mt-10 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary via-primary to-accent-ai text-on-primary shadow-glow transition-transform duration-micro active:scale-[0.95]"
        >
          <span aria-hidden className="ring-pulse absolute inset-0 rounded-full border-2 border-accent-ai/50" />
          <span aria-hidden className="ring-pulse absolute inset-0 rounded-full border border-primary/60" style={{ animationDelay: "1.2s" }} />
          <Mic className="h-7 w-7" />
        </button>

        {ITEMS.slice(2).map(({ href, label, icon: Icon }) => {
          const active = routeIsActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "focus-visible flex h-14 w-14 flex-col items-center justify-center gap-1 rounded-xl text-xs font-medium transition-colors duration-micro",
                active ? "text-primary" : "text-text-muted"
              )}
            >
              <span className="rounded-full px-3 py-1" style={{ background: active ? "var(--primary-soft)" : undefined }}>
                <Icon className="h-5 w-5" />
              </span>
              <span className={cn(active && "font-semibold")}>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
});