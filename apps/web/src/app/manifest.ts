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
    background_color: "#0a1220",
    theme_color: "#0a1220",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
