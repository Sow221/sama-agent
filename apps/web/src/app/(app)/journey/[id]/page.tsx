"use client";

/**
 * Écran 3 — Parcours (G7) : 4 étapes + état + bouton vers le dossier.
 * Les données viennent du moteur déterministe (completion TOUJOURS dérivée, G3).
 */
import { useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button, GlassCard, ThinkingDots, Badge } from "@/components/ui";
import { JourneySteps } from "@/components/journey/JourneySteps";
import { NextActionCard } from "@/components/journey/NextActionCard";
import { useJourneyMutation, useJourneyResume } from "@/lib/query/hooks";
import { useDossierStore, useJourneyStore, usePersistReady } from "@/lib/state/stores";
import { procedureIdOf } from "@/lib/auth/journey-id";

/** Pourquoi un élément bloque (point 20 — « ce qui manque / pourquoi »). */
const STATUS_WHY: Record<string, string> = {
  MISSING: "à fournir",
  PROVIDED: "fourni, analyse en cours",
  NEEDS_REVIEW: "à vérifier — analyse en cours",
  UNEXPECTED: "inattendu, à remplacer",
  UNKNOWN: "non déterminable",
};

/** Pastille d'état réel du parcours (dérivée par le moteur). */
const STATUS_TONE: Record<string, "ok" | "warn" | "danger" | "neutral"> = {
  not_started: "neutral",
  in_progress: "warn",
  needs_action: "danger",
  completed: "ok",
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
      // procedureId explicite : un dossier par-usager (journeyId suffixé) ne doit
      // jamais être confondu avec une procédure du référentiel.
      const base = { journeyId, procedureId: procedureIdOf(journeyId) };
      mutation.mutate(known.length ? { ...base, documents: known } : base);
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
          <ThinkingDots label="Chargement de votre parcours…" />
        )}
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-6 pt-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-semibold uppercase tracking-widest text-accent-ai">
            2 · Parcours
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Votre parcours</h1>
        </div>
        <Badge tone={STATUS_TONE[response.status] ?? "neutral"}>
          {response.status.replaceAll("_", " ")}
        </Badge>
      </div>

      <JourneySteps steps={response.steps} />

      <GlassCard className="flex flex-col items-center gap-1 p-6 text-center">
        <p className="text-sm uppercase tracking-wide text-text2">Dossier</p>
        <p className="text-5xl font-extrabold tracking-tight text-gradient">
          {response.completion.provided}
          <span className="text-2xl text-text2">/{response.completion.required}</span>
        </p>
        <p className="text-sm text-text2">éléments fournis</p>
      </GlassCard>

      {(() => {
        const pending = response.documents.filter((d) => d.status !== "ANALYZED");
        if (!pending.length) return null;
        return (
          <div className="rounded-card border border-white/10 bg-white/[0.04] p-4">
            <p className="text-sm uppercase tracking-wide text-text2">Ce qui manque</p>
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
              className="focus-visible mt-3 inline-block text-sm font-medium text-accent-ai"
            >
              Voir les documents concernés ›
            </Link>
          </div>
        );
      })()}

      <NextActionCard journey={response} />

      <Link href={`/dossier/${journeyId}`} className="w-full">
        <Button className="w-full" size="lg" variant="gradient">
          Voir mon dossier
        </Button>
      </Link>
    </section>
  );
}