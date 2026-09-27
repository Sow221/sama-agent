/**
 * Pied de l'espace, sur tous les écrans : repères discrets, jamais une
 * seconde navigation. Sur mobile, il laisse la place à la BottomNav fixe.
 * Deux lignes : rappel de responsabilité + liens, puis la signature du projet.
 */
import Link from "next/link";

const LINKS = [
  { href: "/app/you/help", label: "Aide" },
  { href: "/app/you/help#engagements", label: "Nos engagements" },
  { href: "/app/you/privacy", label: "Confidentialité" },
  { href: "/app/memory", label: "Mémoire" },
];

export function AppFooter() {
  return (
    <footer className="border-t border-border pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-0">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 pt-4 text-sm text-text-muted sm:px-6 lg:px-10">
        <p>Sama Agent prépare votre dossier ; le service compétent décide.</p>
        <nav aria-label="Liens utiles" className="flex flex-wrap gap-x-5 gap-y-1">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="focus-visible hover:text-text1">
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
      <p className="mx-auto w-full max-w-7xl px-4 pb-4 pt-2 text-xs text-text-muted sm:px-6 lg:px-10">
        © 2026 Sama Agent · Prototype réalisé pour le hackathon GOMYCODE × NVIDIA
      </p>
    </footer>
  );
}
