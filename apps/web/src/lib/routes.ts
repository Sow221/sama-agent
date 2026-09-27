/**
 * Table des écrans — SOURCE UNIQUE des titres (en-tête, onglet du navigateur) et
 * de la navigation « retour » (écran parent logique, jamais une destination fixe).
 * Avant : deux tables divergentes (TopBar / MobileHeader), le même titre d'onglet
 * sur toutes les pages, et un « retour » mobile qui menait toujours à Chats.
 */
export interface RouteInfo {
  /** Titre court de l'en-tête. */
  title: string;
  /** Écran parent (retour mobile) — calculé depuis le chemin réel. */
  parent?: (path: string, search: URLSearchParams) => string;
}

const ROUTES: Array<[RegExp, RouteInfo]> = [
  [/^\/app\/home$/, { title: "Accueil" }],
  [/^\/app\/voice$/, { title: "Voix", parent: () => "/app/home" }],
  [/^\/app\/comprehension$/, { title: "Votre demande", parent: () => "/app/home" }],
  [/^\/app\/journey\/[^/]+$/, { title: "Parcours", parent: () => "/app/home" }],
  [/^\/app\/dossier\/([^/]+)$/, {
    title: "Dossier",
    parent: (p) => `/app/journey/${p.split("/")[3]}`,
  }],
  [/^\/app\/evidence\/[^/]+$/, {
    title: "Pièce du dossier",
    parent: (_p, q) => (q.get("journey") ? `/app/dossier/${q.get("journey")}` : "/app/home"),
  }],
  [/^\/app\/next-action$/, {
    title: "Prochaine action",
    parent: (_p, q) => (q.get("journey") ? `/app/journey/${q.get("journey")}` : "/app/home"),
  }],
  [/^\/app\/chats$/, { title: "Chats" }],
  [/^\/app\/chats\/[^/]+$/, { title: "Conversation", parent: () => "/app/chats" }],
  [/^\/app\/memory$/, { title: "Mémoire" }],
  [/^\/app\/memory\/[^/]+$/, { title: "Souvenir", parent: () => "/app/memory" }],
  [/^\/app\/files$/, { title: "Fichiers" }],
  [/^\/app\/actions$/, { title: "Actions" }],
  [/^\/app\/search$/, { title: "Recherche", parent: () => "/app/home" }],
  [/^\/app\/you$/, { title: "Moi" }],
  [/^\/app\/you\/help$/, { title: "Aide", parent: () => "/app/you" }],
  [/^\/app\/you\/[^/]+$/, { title: "Réglages", parent: () => "/app/you" }],
  [/^\/aide$/, { title: "Aide" }],
  [/^\/login$|^\/auth$/, { title: "Connexion" }],
  [/^\/signup$/, { title: "Créer un compte" }],
  [/^\/forgot-password$/, { title: "Mot de passe oublié" }],
  [/^\/reset-password$/, { title: "Nouveau mot de passe" }],
  [/^\/verify-email$/, { title: "Vérification de l'e-mail" }],
  [/^\/onboarding/, { title: "Bienvenue" }],
];

export function routeInfo(pathname: string): RouteInfo | null {
  return ROUTES.find(([re]) => re.test(pathname))?.[1] ?? null;
}

/** Titre d'onglet : « Écran · Sama Agent » (la page d'accueil publique garde le nom seul). */
export function documentTitle(pathname: string): string {
  const info = routeInfo(pathname);
  return info ? `${info.title} · Sama Agent` : "Sama Agent — Assistant administratif vocal";
}
