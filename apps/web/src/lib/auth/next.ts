/**
 * Retour à la page demandée après connexion.
 *
 * Quand la garde renvoie vers /login, la page visée (ex. un lien direct vers
 * /app/dossier/…) était perdue : l'usager atterrissait toujours sur l'accueil.
 * On la transmet dans `?next=` ET on la garde pour l'onglet (sessionStorage),
 * pour survivre au passage connexion → inscription → onboarding.
 *
 * Sécurité : seule une destination interne à l'espace (`/app…`) est acceptée —
 * jamais `//hote`, `https://…` ni `/\hote` (redirection ouverte).
 */
const KEY = "sama:next";

export function safeNext(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (!/^\/app(\/|\?|$)/.test(raw)) return null;
  if (raw.startsWith("//") || raw.includes("\\")) return null;
  return raw;
}

export function rememberNext(path: string): void {
  if (typeof window === "undefined" || !safeNext(path)) return;
  try {
    window.sessionStorage.setItem(KEY, path);
  } catch {
    /* stockage indisponible : le paramètre d'URL suffit */
  }
}

/** Destination après connexion : `?next=` d'abord, sinon celle gardée pour l'onglet. */
export function pendingNext(): string | null {
  if (typeof window === "undefined") return null;
  const fromUrl = safeNext(new URLSearchParams(window.location.search).get("next"));
  if (fromUrl) return fromUrl;
  try {
    return safeNext(window.sessionStorage.getItem(KEY));
  } catch {
    return null;
  }
}

/** Consomme la destination (une seule utilisation) ; repli : l'accueil de l'espace. */
export function takeNext(fallback = "/app/home"): string {
  const next = pendingNext();
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* rien à nettoyer */
  }
  return next ?? fallback;
}
