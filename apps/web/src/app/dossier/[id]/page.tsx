"use client";

/**
 * Écran 4 — Dossier : les documents du parcours (✓ / !) + compteur dérivé (G3).
 * Un document manquant mène à l'écran Preuve pour le fournir (analyse réelle).
 */
import { useEffect } from "react";
import { useParams } from "next/navigation";
import { Spinner } from "@/components/ui";
import { DocumentCard } from "@/components/journey/DocumentCard";
import { useJourneyMutation } from "@/lib/query/hooks";
import { useJourneyStore } from "@/lib/state/stores";

export default function DossierPage() {
  const params = useParams<{ id: string }>();
  const journeyId = params.id;
  const { response, setResponse } = useJourneyStore();

  const mutation = useJourneyMutation(setResponse);

  useEffect(() => {
    if (journeyId && !response) {
      mutation.mutate({ journeyId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journeyId, response]);

  if (!response) {
    return (
      <div className="flex justify-center py-16">
        {mutation.isError ? (
          <p role="alert" className="text-danger">Le dossier est indisponible. Réessayez.</p>
        ) : (
          <Spinner />
        )}
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-6 pt-4">
      <div>
        <h1 className="text-2xl font-bold">Mon dossier</h1>
        <p className="mt-1 text-sm text-text2">
          {response.completion.provided}/{response.completion.required} éléments fournis
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {response.documents.map((doc) => (
          <DocumentCard key={doc.requirementId} doc={doc} journeyId={journeyId} />
        ))}
      </div>
    </section>
  );
}