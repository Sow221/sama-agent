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
