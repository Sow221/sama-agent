/**
 * Lien d'évitement « Aller au contenu » (clavier, lecteur d'écran) : invisible
 * tant qu'il n'a pas le focus. Partagé par l'AppShell et le layout public —
 * module sans "use client", pour rester importable côté serveur.
 */
export const SKIP_LINK =
  "focus-visible sr-only z-system rounded-full bg-surface-elevated px-4 py-2 text-sm font-semibold text-text1 shadow-elevated focus:not-sr-only focus:fixed focus:left-4 focus:top-3";
