"use client";

/**
 * Écran 4 — Dossier : les documents du parcours (✓ / !) + compteur dérivé (G3).
 * Un document manquant mène à l'écran Preuve pour le fournir (analyse réelle).
 */
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button, ErrorNotice, ThinkingDots } from "@/components/ui";
import { ArrowRightIcon } from "@/components/icons";
import { DocumentCard } from "@/components/journey/DocumentCard";
import { useJourneyState } from "@/lib/query/journey-state";

export default function DossierPage() {
  const params = useParams<{ id: string }>();
  const journeyId = params.id;
  const { journey: response, failed, error, retry } = useJourneyState(journeyId);

  if (!response) {
    return (
      <div className="flex justify-center py-16">
        {failed ? (
          <ErrorNotice error={error} action="La lecture du dossier" onRetry={retry} className="w-full max-w-md" />
        ) : (
          <ThinkingDots label="Chargement de votre dossier…" />
        )}
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-6 pt-8">
      <div>
        <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-semibold uppercase tracking-widest text-accent-ai">
          Étape 2 · Préparer
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Mon dossier</h1>
        <p className="mt-1 text-sm text-text2">
          {response.completion.provided}/{response.completion.required} éléments fournis
        </p>
      </div>

      <p className="text-sm text-text2">
        Touchez une pièce pour voir ce qui est exigé, la source officielle, et déposer
        votre document.
      </p>

      <div className="flex flex-col gap-3">
        {response.documents.map((doc) => (
          <DocumentCard key={doc.requirementId} doc={doc} journeyId={journeyId} />
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Link href={`/app/next-action?journey=${encodeURIComponent(journeyId)}`} className="w-full">
          <Button className="w-full" size="lg" variant="gradient">
            Voir la prochaine action
            <ArrowRightIcon className="h-5 w-5" />
          </Button>
        </Link>
        <Link href={`/app/journey/${journeyId}`} className="w-full">
          <Button className="w-full" size="lg" variant="secondary">
            Revenir au parcours
          </Button>
        </Link>
      </div>
    </section>
  );
}