import Link from "next/link";
import { BrandTile } from "@/components/brand/Logo";

/** 404 — toute URL inconnue de l'application (français, charte de l'app). */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-5 px-6 text-center">
      <BrandTile size={56} />
      <p className="text-sm font-semibold uppercase tracking-widest text-accent-ai">Erreur 404</p>
      <h1 className="text-3xl font-extrabold tracking-tight">Cette page n'existe pas</h1>
      <p className="text-text2">
        Le lien est peut-être incomplet ou la page a été déplacée. Votre dossier, lui, est intact.
      </p>
      <div className="flex w-full flex-col gap-2 sm:flex-row">
        <Link
          href="/"
          className="focus-visible inline-flex min-h-12 flex-1 items-center justify-center rounded-full bg-gradient-to-r from-primary to-accent-ai px-5 font-semibold text-on-primary"
        >
          Aller à l'accueil
        </Link>
        <Link
          href="/aide"
          className="focus-visible inline-flex min-h-12 flex-1 items-center justify-center rounded-full border border-border bg-surface-elevated px-5 font-semibold text-text1"
        >
          Obtenir de l'aide
        </Link>
      </div>
    </main>
  );
}
