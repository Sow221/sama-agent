/**
 * Logo officiel Sama Agent (kit SVG v1.0) — jamais redessiné à la main.
 *  - `BrandLogo` : logo horizontal pour fond sombre (symbole + « sama agent » vectorisé).
 *  - `BrandTile` : symbole seul (tuile sauge + parallélogramme encre), pour les petits
 *    formats (barre latérale réduite, cartes d'authentification, 404).
 * Couleurs de marque : sauge #B7D8A8, encre #11110F, ivoire #F7F5EF, forêt #164A3A.
 */
export function BrandLogo({ className = "h-7 w-auto" }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- SVG vectoriel statique, aucune optimisation utile
  return <img src="/brand/logo-horizontal-dark.svg" alt="Sama Agent" width={211} height={28} className={className} />;
}

export function BrandTile({ size = 36, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 150 150" width={size} height={size} className={className} aria-hidden focusable="false">
      <path
        d="M33 0H117A33 33 0 0 1 150 33V117A33 33 0 0 1 117 150H33A33 33 0 0 1 0 117V33A33 33 0 0 1 33 0Z"
        fill="#B7D8A8"
      />
      <polygon points="45.427,42 87.413,42 104.573,108 62.587,108" fill="#11110F" />
    </svg>
  );
}
