"use client";

/**
 * En-tête public (landing, aide, connexion, inscription) — pleine largeur.
 * Logo à gauche ; à droite la navigation (≥ md) puis l'action de compte :
 * visiteur → « Se connecter » + « Créer un compte » ; connecté → « Ouvrir mon
 * espace ». Sur la page de connexion, l'action utile est l'inscription (et
 * inversement) : on ne propose pas la page où l'on se trouve déjà.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";
import { BrandLogo } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

export function BrandMark({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="focus-visible flex shrink-0 items-center rounded-lg" aria-label="Sama Agent — accueil">
      {/* Logo réduit sous 640 px : à 360 px, logo + thème + action débordaient. */}
      <BrandLogo className="h-5 w-auto sm:h-7" />
    </Link>
  );
}

const NAV = [
  { href: "/#comment", label: "Comment ça marche" },
  { href: "/#fonctionnalites", label: "Fonctionnalités" },
  { href: "/#engagements", label: "Engagements" },
  { href: "/#faq", label: "Questions" },
];

export function Header() {
  const pathname = usePathname();
  const { configured, loading, session } = useAuth();
  const inside = session || (!configured && !loading);

  return (
    <header className="sticky top-0 z-header border-b border-border bg-header-bg backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-4 sm:gap-3 sm:px-6">
        <BrandMark />

        <nav aria-label="Navigation principale" className="hidden items-center gap-1 lg:flex">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={pathname === n.href ? "page" : undefined}
              className={`focus-visible rounded-full px-3 py-2 text-sm font-medium transition-colors hover:text-text1 ${
                pathname === n.href ? "text-primary" : "text-text2"
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <ThemeToggle />
          {inside ? (
            <Link
              href="/app/home"
              className="focus-visible inline-flex min-h-10 items-center whitespace-nowrap rounded-full bg-gradient-to-r from-primary to-accent-ai px-3 text-sm font-semibold text-on-primary sm:px-4"
            >
              {/* Libellé court sous 640 px : le libellé complet débordait à 360 px. */}
              <span className="sm:hidden">Mon espace</span>
              <span className="hidden sm:inline">Ouvrir mon espace</span>
            </Link>
          ) : loading ? null : (
            <>
              {pathname !== "/login" ? (
                <Link
                  href="/login"
                  className="focus-visible inline-flex min-h-10 items-center whitespace-nowrap rounded-full px-2.5 text-sm font-semibold text-text1 hover:bg-surface-hover sm:px-3"
                >
                  Se connecter
                </Link>
              ) : null}
              {pathname !== "/signup" ? (
                <Link
                  href="/signup"
                  // Mobile : le hero porte déjà l'appel « Créer mon compte » ; l'en-tête garde la connexion.
                  className={`focus-visible ${pathname === "/login" ? "inline-flex" : "hidden sm:inline-flex"} min-h-10 items-center whitespace-nowrap rounded-full bg-gradient-to-r from-primary to-accent-ai px-3 text-sm font-semibold text-on-primary sm:px-4`}
                >
                  <span className="sm:hidden">S&apos;inscrire</span>
                  <span className="hidden sm:inline">Créer un compte</span>
                </Link>
              ) : null}
            </>
          )}
        </div>
      </div>
    </header>
  );
}
