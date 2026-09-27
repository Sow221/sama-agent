/** Aide — page publique (visiteurs) : bien démarrer, engagements, FAQ. */
import { HelpContent } from "@/components/help/HelpContent";
import { BrandTon } from "@/components/brand/Logo";

export default function AidePage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-16 pt-10 sm:px-6 md:pt-14">
      <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-primary">
                  <BrandTon className="h-3 w-auto" />Aide</p>
      <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">Comment Sama Agent vous accompagne</h1>
      <p className="mt-3 max-w-2xl text-lg text-text2">
        Les étapes de votre démarche, ce à quoi l'agent s'engage, et les réponses aux questions
        les plus fréquentes.
      </p>
      <div className="mt-10">
        <HelpContent />
      </div>
    </div>
  );
}
