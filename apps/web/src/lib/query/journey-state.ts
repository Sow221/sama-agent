"use client";

/**
 * État d'UN dossier pour les écrans Parcours, Dossier et Prochaine action.
 *
 * Source de vérité : le SERVEUR (GET /api/journey/:id). Le store de session ne
 * sert que de cache rapide, et seulement s'il porte le MÊME dossier (avant, un
 * écran pouvait afficher l'état d'un autre parcours resté en cache). Si le
 * dossier n'a jamais été persisté (404), il est créé par POST — en embarquant
 * les analyses connues, pour que le moteur dérive le même état.
 */
import { useEffect } from "react";
import { useJourneyMutation, useJourneyResume } from "@/lib/query/hooks";
import { useDossierStore, useJourneyStore, usePersistReady } from "@/lib/state/stores";
import { procedureIdOf } from "@/lib/auth/journey-id";
import type { JourneyResponse } from "@/lib/schemas";

export function useJourneyState(journeyId: string | undefined): {
  journey: JourneyResponse | null;
  failed: boolean;
  /** Erreur réelle du serveur (ex. 404 dossier inconnu), pour ErrorNotice. */
  error: unknown;
  retry: () => void;
} {
  const { response, setResponse } = useJourneyStore();
  const analyses = useDossierStore((s) => s.analyses);
  const persistReady = usePersistReady();
  const cached = response && response.journeyId === journeyId ? response : null;

  const mutation = useJourneyMutation(setResponse);
  const resume = useJourneyResume(journeyId, persistReady && !cached);

  useEffect(() => {
    if (resume.data) setResponse(resume.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resume.data]);

  function create() {
    if (!journeyId) return;
    const known = Object.entries(analyses).map(([requirementId, a]) => ({
      requirementId,
      status: a.status,
    }));
    const base = { journeyId, procedureId: procedureIdOf(journeyId) };
    mutation.mutate(known.length ? { ...base, documents: known } : base);
  }

  useEffect(() => {
    // Repli uniquement si la reprise est impossible (dossier non persisté).
    if (!journeyId || cached || !persistReady || !resume.isError || !resume.isFetched) return;
    if (mutation.isPending || mutation.isError) return;
    create();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journeyId, cached, analyses, persistReady, resume.isError, resume.isFetched]);

  return {
    journey: cached,
    failed: mutation.isError,
    error: mutation.error,
    retry: create,
  };
}
