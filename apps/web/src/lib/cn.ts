/** Fusion simple de classes — évite une dépendance clsx/tailwind-merge pour l'instant. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}