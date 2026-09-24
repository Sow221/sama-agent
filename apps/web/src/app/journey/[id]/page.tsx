"use client";

/**
 * Écran 3 — Parcours (G7) : 4 étapes + état + bouton vers le dossier.
 * Les données viennent du moteur déterministe (completion TOUJOURS dérivée, G3).
 */
import { useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button, Spinner } from "@/components/ui";
import { JourneySteps } from "@/components/journey/JourneySteps";
import { NextActionCard } from "@/components/journey/NextActionCard";
import { useJourneyMutation } from "@/lib/query/hooks";
import { useJourneyStore } from "@/lib/state/stores";

export default function ParcoursPage() {
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
          <p role="alert" className="text-danger">
            Le parcours est indisponible. Réessayez.
          </p>
        ) : (
          <Spinner />
        )}
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-6 pt-4">
      <div>
        <h1 className="text-2xl font-bold">Votre parcours</h1>
        <p className="mt-1 text-sm uppercase tracking-wide text-text2">
          {response.status.replaceAll("_", " ")}
        </p>
      </div>

      <JourneySteps steps={response.steps} />

      <div className="rounded-card bg-surface border border-surface-2 p-4 text-center">
        <p className="text-sm text-text2">Dossier</p>
        <p className="text-3xl font-bold text-primary">
          {response.completion.provided}/{response.completion.required}
        </p>
        <p className="text-sm text-text2">éléments fournis</p>
      </div>

      <NextActionCard journey={response} />

      <Link href={`/dossier/${journeyId}`} className="w-full">
        <Button className="w-full" size="lg">
          Voir mon dossier
        </Button>
      </Link>
    </section>
  );
}