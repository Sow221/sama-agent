"use client";

/**
 * Bascule clair / sombre, en haut de l'en-tête. Icône seule.
 *
 * Deux boutons dans le document, un seul affiché : la classe `dark` choisit
 * lequel. Chacun porte son propre `aria-label`, donc le nom accessible est
 * exactement celui de l'icône affichée, et rien n'est calculé pendant le rendu —
 * le HTML du serveur ne peut pas diverger du premier rendu client. Le bouton
 * masqué est en `display:none`, il disparaît aussi de l'arbre d'accessibilité.
 */
import { MoonIcon, SunIcon } from "@/components/icons";
import { toggleTheme } from "@/lib/theme";
import { cn } from "@/lib/cn";

const BUTTON =
  "focus-visible flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text2 transition-colors duration-micro hover:bg-surface-hover hover:text-text1";

export function ThemeToggle({ className }: { className?: string }) {
  return (
    <>
      {/* En clair on propose la lune, en sombre le soleil. */}
      <button
        type="button"
        onClick={toggleTheme}
        aria-label="Passer en mode sombre"
        title="Passer en mode sombre"
        className={cn(BUTTON, "dark:hidden", className)}
      >
        <MoonIcon className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={toggleTheme}
        aria-label="Passer en mode clair"
        title="Passer en mode clair"
        className={cn(BUTTON, "hidden dark:inline-flex", className)}
      >
        <SunIcon className="h-5 w-5" />
      </button>
    </>
  );
}
