"use client";

/**
 * Écran 4 — Dossier : les documents du parcours (✓ / !) + compteur dérivé (G3).
 * Un document manquant mène à l'écran Preuve pour le fournir (analyse réelle).
 */
import { useEffect } from "react";
import { useParams } from "next/navigation";
import { ThinkingDots } from "@/components/ui";
import { DocumentCard } from "@/components/journey/DocumentCard";
import { useJourneyMutation, useJourneyResume } from "@/lib/query/hooks";
import { useDossierStore, useJourneyStore, usePersistReady } from "@/lib/state/stores";
import { procedureIdOf } from "@/lib/auth/journey-id";

export default function DossierPage() {
  const params = useParams<{ id: string }>();
  const journeyId = params.id;
  const { response, setResponse } = useJourneyStore();
  const analyses = useDossierStore((s) => s.analyses);
  const persistReady = usePersistReady();

  const mutation = useJourneyMutation(setResponse);
  // Reprise : l'état vient d'abord du SERVEUR (GET resume — source de vérité §7.3).
  const resume = useJourneyResume(journeyId, persistReady && !response);

  useEffect(() => {
    if (resume.data) setResponse(resume.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resume.data]);

  useEffect(() => {
    // Repli uniquement si reprise impossible (parcours non persisté côté serveur).
    if (journeyId && !response && persistReady && resume.isError && resume.isFetched) {
      // Point 6 : même principe que Parcours — le refetch ne peut pas effacer d'analyses,
      // il les embarque pour que le moteur serveur dérive le même état.
      const known = Object.entries(analyses).map(([requirementId, a]) => ({
        requirementId,
        status: a.status,
      }));
      const base = { journeyId, procedureId: procedureIdOf(journeyId) };
      mutation.mutate(known.length ? { ...base, documents: known } : base);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journeyId, response, analyses, persistReady, resume.isError, resume.isFetched]);

  if (!response) {
    return (
      <div className="flex justify-center py-16">
        {mutation.isError ? (
          <p role="alert" className="text-danger">Le dossier est indisponible. Réessayez.</p>
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
          3 · Dossier
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Mon dossier</h1>
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