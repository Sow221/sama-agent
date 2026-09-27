/**
 * Logo officiel Sama Agent (kit SVG v1.0) — jamais redessiné à la main.
 *  - `BrandLogo` : logo horizontal (symbole + « sama agent » vectorisé).
 *  - `BrandTile` : symbole seul (tuile sauge + parallélogramme encre), pour les petits
 *    formats (barre latérale réduite, cartes d'authentification, 404).
 * Couleurs de marque : sauge #B7D8A8, encre #11110F, ivoire #F7F5EF, forêt #164A3A.
 *
 * Le logotype est ivoire dans le kit, donc invisible sur fond clair. La variante
 * claire n'est pas un redessin : c'est le même fichier avec les deux `fill` du
 * logotype passés de l'ivoire à l'encre (géométrie identique, octet pour octet).
 * Les deux images sont dans le document, la classe `dark` choisit laquelle est
 * visible — aucun JavaScript, donc rien à désynchroniser au premier rendu. Comme
 * la variante masquée est en `display:none`, elle disparaît aussi de l'arbre
 * d'accessibilité : une seule expose le nom « Sama Agent », dans les deux thèmes.
 */
export function BrandLogo({ className = "h-7 w-auto" }: { className?: string }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- SVG vectoriel statique, aucune optimisation utile */}
      <img
        src="/brand/logo-horizontal-light.svg"
        alt="Sama Agent"
        width={211}
        height={28}
        className={`${className} dark:hidden`}
      />
      {/* eslint-disable-next-line @next/next/no-img-element -- SVG vectoriel statique, aucune optimisation utile */}
      <img
        src="/brand/logo-horizontal-dark.svg"
        alt="Sama Agent"
        width={211}
        height={28}
        className={`${className} hidden dark:block`}
      />
    </>
  );
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

/** « Ton » de la charte (08-elements-graphiques) : le parallélogramme, en puce ou repère. */
export function BrandTon({ className = "h-3 w-auto text-primary" }: { className?: string }) {
  return (
    <svg viewBox="0 0 23.3 26" className={className} aria-hidden focusable="false">
      <polygon points="0,0 16.54,0 23.3,26 6.76,26" fill="currentColor" />
    </svg>
  );
}
