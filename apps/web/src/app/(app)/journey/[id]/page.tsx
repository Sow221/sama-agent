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
import { useJourneyMutation, useJourneyResume } from "@/lib/query/hooks";
import { useDossierStore, useJourneyStore, usePersistReady } from "@/lib/state/stores";

/** Pourquoi un élément bloque (point 20 — « ce qui manque / pourquoi »). */
const STATUS_WHY: Record<string, string> = {
  MISSING: "à fournir",
  PROVIDED: "fourni, analyse en cours",
  NEEDS_REVIEW: "à vérifier — analyse en cours",
  UNEXPECTED: "inattendu, à remplacer",
  UNKNOWN: "non déterminable",
};

export default function ParcoursPage() {
  const params = useParams<{ id: string }>();
  const journeyId = params.id;
  const { response, setResponse } = useJourneyStore();
  const analyses = useDossierStore((s) => s.analyses);
  const persistReady = usePersistReady();

  const mutation = useJourneyMutation(setResponse);
  // Reprise : l'état vient d'abord du SERVEUR (GET resume). Si le parcours n'a
  // jamais été persisté (404), l'effet de repli ci-dessous le crée via le POST.
  const resume = useJourneyResume(journeyId, persistReady && !response);

  useEffect(() => {
    if (resume.data) setResponse(resume.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resume.data]);

  useEffect(() => {
    // Repli uniquement si reprise impossible (parcours non persisté côté serveur).
    if (journeyId && !response && persistReady && resume.isError && resume.isFetched) {
      // Point 6 : on ne demande JAMAIS un état qui efface des analyses — le refetch
      // embarque les documents déjà analysés pour que le moteur dérive le même état.
      // (les `name` sont backfillés par le moteur serveur)
      const known = Object.entries(analyses).map(([requirementId, a]) => ({
        requirementId,
        status: a.status,
      }));
      mutation.mutate(known.length ? { journeyId, documents: known } : { journeyId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journeyId, response, analyses, persistReady, resume.isError, resume.isFetched]);

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

      {(() => {
        const pending = response.documents.filter((d) => d.status !== "ANALYZED");
        if (!pending.length) return null;
        return (
          <div className="rounded-card bg-surface border border-surface-2 p-4">
            <p className="text-sm text-text2">Ce qui manque</p>
            <ul className="mt-2 space-y-2">
              {pending.map((d) => (
                <li key={d.requirementId} className="text-sm text-text1">
                  <span className="font-semibold">{d.name}</span>{" "}
                  <span className="text-text2">— {STATUS_WHY[d.status] ?? d.status}</span>
                </li>
              ))}
            </ul>
            <Link
              href={`/dossier/${journeyId}`}
              className="focus-visible mt-3 inline-block text-sm text-accent-ai"
            >
              Voir les documents concernés ›
            </Link>
          </div>
        );
      })()}

      <NextActionCard journey={response} />

      <Link href={`/dossier/${journeyId}`} className="w-full">
        <Button className="w-full" size="lg">
          Voir mon dossier
        </Button>
      </Link>
    </section>
  );
}