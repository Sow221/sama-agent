/**
 * Sidebar web — UI/UX Master Spec §3-6, §77-78.
 * Zones : Brand · Action primaire · Navigation principale · Récent · Utilité · Compte.
 * Largeurs : desktop 256px (expanded) / 72px (collapsed, tooltips) ; tablette 72px (§6) ;
 * mobile masquée (BottomNav). Le menu ne doit JAMAIS devenir une liste de fonctions (§4).
 */
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ActionIcon,
  ArrowLeftIcon,
  ChatIcon,
  FileIcon,
  FlagIcon,
  HomeIcon,
  InfoIcon,
  MemoryIcon,
  PlusIcon,
  UserIcon,
} from "@/components/icons";
import { useJourneyStore } from "@/lib/state/stores";
import { cn } from "@/lib/cn";
import { Tooltip } from "@/components/ui";
import { BrandLogo, BrandTile } from "@/components/brand/Logo";

const MAIN_NAV = [
  { href: "/app/home", label: "Accueil", icon: HomeIcon },
  { href: "/app/chats", label: "Chats", icon: ChatIcon },
  { href: "/app/memory", label: "Mémoire", icon: MemoryIcon },
  { href: "/app/files", label: "Fichiers", icon: FileIcon },
  { href: "/app/actions", label: "Actions", icon: ActionIcon },
] as const;

const UTILITY_NAV = [
  { href: "/app/you/help", label: "Aide", icon: InfoIcon },
  { href: "/app/you", label: "Moi", icon: UserIcon },
] as const;

function matches(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

const ALL_HREFS = [...MAIN_NAV, ...UTILITY_NAV].map((i) => i.href);

/** Un seul lien actif : le plus précis (sur /app/you/help, « Aide » et non « Moi »). */
function routeIsActive(pathname: string, href: string) {
  if (!matches(pathname, href)) return false;
  return !ALL_HREFS.some((other) => other.length > href.length && matches(pathname, other));
}

export function Sidebar() {
  const pathname = usePathname();
  const journey = useJourneyStore((s) => s.response);
  const [pref, setPref] = useState<"expanded" | "collapsed">("expanded");
  const [viewport, setViewport] = useState<"tablet" | "desktop">("desktop");

  useEffect(() => {
    const saved = (typeof window !== "undefined" ? localStorage.getItem("sama:sidebar") : null) as
      | "expanded"
      | "collapsed"
      | null;
    if (saved === "collapsed" || saved === "expanded") setPref(saved);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1200px)");
    const update = () => setViewport(mq.matches ? "desktop" : "tablet");
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const collapsed = pref === "collapsed" || viewport === "tablet";
  const width = collapsed ? 72 : 256;

  const toggle = () => {
    setPref((p) => {
      const next = p === "expanded" ? "collapsed" : "expanded";
      localStorage.setItem("sama:sidebar", next);
      return next;
    });
  };

  const NavList = ({ items }: { items: typeof MAIN_NAV }) => (
    <ul className="flex flex-col gap-1">
      {items.map(({ href, label, icon: Icon }) => {
        const active = routeIsActive(pathname, href);
        return (
          <li key={href}>
            {collapsed ? (
              <Tooltip label={label}>
                <Link
                  href={href}
                  aria-label={label}
                  className={cn(
                    "focus-visible flex h-11 w-11 items-center justify-center rounded-xl transition-colors duration-micro",
                    active ? "bg-primary-soft text-primary" : "text-text2 hover:bg-surface-hover hover:text-text1"
                  )}
                >
                  <Icon className="h-5 w-5" />
                </Link>
              </Tooltip>
            ) : (
              <Link
                href={href}
                className={cn(
                  "focus-visible flex items-center gap-3 rounded-xl px-3 py-2.5 text-base font-medium transition-colors duration-micro",
                  active ? "bg-primary-soft text-primary" : "text-text2 hover:bg-surface-hover hover:text-text1"
                )}
              >
                <Icon className="h-5 w-5" />
                <span>{label}</span>
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );

  return (
    <aside
      className="sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-border bg-surface/30 backdrop-blur-xl md:flex"
      style={{ width }}
      aria-label="Navigation principale"
    >
      {/* Brand */}
      <div className={cn("flex items-center px-4 py-5", collapsed && "justify-center px-0")}>
        <Link href="/app/home" className="focus-visible flex items-center gap-2" aria-label="Sama Agent — Accueil">
          {collapsed ? <BrandTile size={36} /> : <BrandLogo className="h-7 w-auto" />}
        </Link>
      </div>

      {/* Action primaire */}
      <div className={cn("px-3", collapsed && "px-0 text-center")}>
        {collapsed ? (
          <Tooltip label="Nouveau parcours">
            <Link
              href="/app/home"
              aria-label="Nouveau parcours"
              className="focus-visible mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent-ai text-[#11110f] shadow-glow hover:brightness-110"
            >
              <PlusIcon className="h-5 w-5" />
            </Link>
          </Tooltip>
        ) : (
          <Link
            href="/app/home"
            className="focus-visible flex min-h-11 items-center justify-center gap-2 rounded-full bg-gradient-to-br from-primary to-accent-ai text-base font-bold text-[#11110f] shadow-glow transition-all duration-micro hover:brightness-110 active:scale-[0.97]"
          >
            <PlusIcon className="h-5 w-5" /> Nouveau parcours
          </Link>
        )}
      </div>

      {/* Navigation principale */}
      <nav className={cn("mt-6 flex flex-col gap-6 overflow-y-auto px-3 pb-4", collapsed && "px-0")}>
        <NavList items={MAIN_NAV} />
      </nav>

      {/* Récent (parcours de session réel) */}
      {journey && (
        <div className="flex-1 overflow-y-auto">
          <p className={cn("mb-1 px-4 text-xs font-semibold uppercase tracking-widest text-text-muted", collapsed && "px-0 text-center")}>
            {collapsed ? "" : "Récent"}
          </p>
          {collapsed ? (
            <div className="px-0 text-center">
              <Tooltip label="Parcours en cours">
                <Link
                  href={`/app/journey/${journey.journeyId}`}
                  aria-label="Parcours en cours"
                  className="focus-visible inline-flex h-11 w-11 items-center justify-center rounded-xl text-text2 hover:bg-surface-hover hover:text-text1"
                >
                  <FlagIcon className="h-5 w-5" />
                </Link>
              </Tooltip>
            </div>
          ) : (
            <Link
              href={`/app/journey/${journey.journeyId}`}
              className="focus-visible mx-3 flex items-center gap-3 rounded-xl px-3 py-2.5 text-base text-text2 hover:bg-surface-hover hover:text-text1"
            >
              <FlagIcon className="h-5 w-5 shrink-0" />
              <span className="truncate">Parcours en cours</span>
            </Link>
          )}
        </div>
      )}

      {/* Bas : utilité + compte */}
      <div className="border-t border-border p-3">
        <ul className="flex flex-col gap-1">
          {UTILITY_NAV.map(({ href, label, icon: Icon }) => (
            <li key={href}>
              {collapsed ? (
                <Tooltip label={label}>
                  <Link
                    href={href}
                    aria-label={label}
                    className={cn(
                      "focus-visible flex h-11 w-11 items-center justify-center rounded-xl transition-colors duration-micro",
                      routeIsActive(pathname, href)
                        ? "bg-primary-soft text-primary"
                        : "text-text2 hover:bg-surface-hover hover:text-text1"
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </Link>
                </Tooltip>
              ) : (
                <Link
                  href={href}
                  className={cn(
                    "focus-visible flex items-center gap-3 rounded-xl px-3 py-2.5 text-base font-medium transition-colors duration-micro",
                    routeIsActive(pathname, href)
                      ? "bg-primary-soft text-primary"
                      : "text-text2 hover:bg-surface-hover hover:text-text1"
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span>{label}</span>
                </Link>
              )}
            </li>
          ))}
        </ul>
        {viewport === "desktop" ? (
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? "Étendre la barre latérale" : "Réduire la barre latérale"}
            className="focus-visible mt-3 hidden w-full items-center justify-center rounded-lg py-1.5 text-sm text-text-muted hover:text-text1 min-[1200px]:flex"
          >
            <ArrowLeftIcon className={cn("h-4 w-4 transition-transform duration-ui", collapsed && "rotate-180")} />
          </button>
        ) : null}
      </div>
    </aside>
  );
}