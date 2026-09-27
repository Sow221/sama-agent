import type { MetadataRoute } from "next";

/** Manifest PWA : l'app s'installe sur l'écran d'accueil d'un téléphone. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sama Agent — Assistant administratif vocal",
    short_name: "Sama Agent",
    description:
      "Comprendre et suivre vos démarches administratives au Sénégal, à la voix en wolof ou par écrit en français.",
    lang: "fr",
    start_url: "/app/home",
    display: "standalone",
    // Le manifest est un fichier statique : il ne peut pas exprimer deux thèmes.
    // On garde l'encre de la charte, c'est la couleur de l'écran de démarrage
    // pendant une fraction de seconde. Le thème de l'app, lui, est dynamique
    // (voir `viewport` et le script de thème dans app/layout.tsx).
    background_color: "#11110f",
    theme_color: "#11110f",
    icons: [
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
