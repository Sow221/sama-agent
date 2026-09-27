/**
 * Pied de page public : repères de navigation, transparence, crédits réels.
 * Les crédits nomment les technologies effectivement branchées dans l'app.
 */
import Link from "next/link";
import { BrandMark } from "./Header";

const LINKS = [
  { href: "/#comment", label: "Comment ça marche" },
  { href: "/#faq", label: "Questions fréquentes" },
  { href: "/limits", label: "Limites de l'application" },
  { href: "/signup", label: "Créer un compte" },
  { href: "/login", label: "Se connecter" },
];

export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="flex flex-col gap-3">
          <BrandMark />
          <p className="max-w-sm text-sm text-text2">
            Assistant pour préparer vos démarches administratives au Sénégal, à la voix en wolof ou
            par écrit en français. Sama Agent accompagne : il ne remplace pas l'administration.
          </p>
        </div>
        <nav aria-label="Liens du pied de page" className="flex flex-col gap-2 text-sm">
          <p className="font-semibold text-text1">Sama Agent</p>
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="focus-visible w-fit text-text2 hover:text-text1">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex flex-col gap-2 text-sm text-text2">
          <p className="font-semibold text-text1">Technologies</p>
          <p>Compréhension et vision : NVIDIA</p>
          <p>Reconnaissance du wolof : Kiriku (IA Hub Sénégal)</p>
          <p>Voix wolof : Adia (Concree)</p>
          <p>Source officielle : CAPP Karangë</p>
        </div>
      </div>
      <div className="border-t border-border">
        <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-text-muted sm:px-6">
          Prototype réalisé pour le hackathon GOMYCODE × NVIDIA — septembre 2026.
        </p>
      </div>
    </footer>
  );
}
