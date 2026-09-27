"use client";

/**
 * Écran 5 — Preuve (G7) : pour un élément du dossier.
 *  - Affiche la preuve officielle du service (GET /api/evidence/:requirement)
 *  - Permet de fournir le document : fichier réel envoyé → analyse par la VRAIE
 *    chaîne de vision (POST /api/documents/analyze). Aucun résultat pré-réglé.
 */
import { useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button, GlassCard, ThinkingDots } from "@/components/ui";
import { ArrowLeftIcon, ArrowRightIcon, UploadIcon, CheckIcon, CloseIcon } from "@/components/icons";
import { EvidencePanel } from "@/components/journey/EvidencePanel";
import { useEvidence, useAnalyzeMutation, useJourneyMutation } from "@/lib/query/hooks";
import { useDossierStore, useJourneyStore } from "@/lib/state/stores";
import { useAuth } from "@/lib/auth/auth-context";
import { journeyIdFor, procedureIdOf } from "@/lib/auth/journey-id";
import { documentStatusLabel, requirementLabel } from "@/lib/labels";
import { BrandTon } from "@/components/brand/Logo";

export default function PreuvePage() {
  const params = useParams<{ requirement: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const requirement = decodeURIComponent(params.requirement);
  const { user } = useAuth();
  // Repli : le dossier DE l'usager (jamais le slug partagé — appropriation serveur).
  const journeyId =
    searchParams.get("journey") ?? journeyIdFor("driving_license_new", user?.id);

  const [file, setFile] = useState<File | null>(null);
  const evidence = useEvidence(requirement);
  const setAnalysis = useDossierStore((s) => s.setAnalysis);
  const { response: journey, setResponse } = useJourneyStore();

  const analyze = useAnalyzeMutation();
  /** Point 6 : l'état du dossier change → le Journey Engine est re-questionné (jamais de valeur locale).
      Pas de navigation automatique : le résultat d'analyse reste visible, puis l'utilisateur
      revient au dossier (bouton « Retourner au dossier »). */
  const recomputeJourney = useJourneyMutation((r) => setResponse(r));

  const result = useDossierStore((s) => s.analyses[requirement]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    form.append("requirementId", requirement);
    form.append("journeyId", journeyId);
    const analysis = await analyze.mutateAsync(form);
    setAnalysis(requirement, analysis);
    // Point 6 : l'état du dossier change → le Journey Engine est re-questionné (jamais de valeur locale).
    const docs = (journey?.documents ?? []).map((d) =>
      d.requirementId === requirement ? { ...d, status: analysis.status } : d
    );
    recomputeJourney.mutate({ journeyId, procedureId: procedureIdOf(journeyId), documents: docs });
  }

  const pending = analyze.isPending;

  return (
    <section className="flex flex-col gap-6 pt-8">
      <div>
        <Link
          href={`/app/dossier/${journeyId}`}
          className="focus-visible inline-flex items-center gap-1 text-sm font-medium text-accent-ai"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Mon dossier
        </Link>
        <br />
        <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-semibold uppercase tracking-widest text-accent-ai">
          <BrandTon className="h-2.5 w-auto text-primary" />
          Étape 3 · Vérifier
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight">
          {requirementLabel(requirement, journey)}
        </h1>
      </div>

      {evidence.isLoading ? (
        <div className="flex justify-center py-8">
          <ThinkingDots label="Chargement de l'information officielle…" />
        </div>
      ) : evidence.data ? (
        <EvidencePanel evidence={evidence.data} />
      ) : evidence.isError ? (
        <div
          role="alert"
          className="rounded-card border border-warning/30 bg-warning/10 p-4 text-sm text-text1"
        >
          <p className="font-semibold text-warning">Information à confirmer</p>
          <p className="mt-1">
            Cette information ne peut pas être confirmée avec les sources disponibles.
            Vérifiez auprès du service compétent.
          </p>
        </div>
      ) : null}

      <GlassCard className="p-5">
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-card border-2 border-dashed border-white/15 bg-white/[0.03] p-5 text-center transition-colors hover:border-accent-ai/50">
            <UploadIcon className="h-8 w-8 text-accent-ai" />
            <span className="text-sm font-semibold">
              {file ? file.name : "Fournir le document"}
            </span>
            <span className="text-xs text-text2">
              {file
                ? "Cliquez pour remplacer"
                : "Image ou PDF — le document est analysé par la chaîne réelle"}
            </span>
            <input
              type="file"
              accept="image/*,.pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="sr-only"
            />
          </label>
          {file ? (
            <div className="flex items-center justify-between text-sm text-text2">
              <span className="truncate max-w-[80%]">{file.name}</span>
              <button
                type="button"
                onClick={() => setFile(null)}
                aria-label="Retirer le fichier"
                className="focus-visible rounded-full p-1 hover:text-danger"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>
          ) : null}
          <Button
            type="submit"
            variant="gradient"
            disabled={!file || pending}
            className="w-full"
          >
            {pending ? (
              <ThinkingDots label="Analyse de votre document…" />
            ) : (
              <>
                Analyser le document
                <CheckIcon className="h-5 w-5" />
              </>
            )}
          </Button>
          {analyze.isError ? (
            <p role="alert" className="text-sm text-danger">
              L'analyse a échoué : le fichier n'a pas pu être traité. Vérifiez qu'il
              s'agit d'une image ou d'un PDF de moins de 10 Mo, puis réessayez.
            </p>
          ) : null}
        </form>
      </GlassCard>

      {result ? (
        <GlassCard className={`p-5 ${result.status === "ANALYZED" ? "" : "border-warning/30"}`}>
          <p className="font-semibold">
            Résultat de l'analyse :{" "}
            <span className={result.status === "ANALYZED" ? "text-primary" : "text-warning"}>
              {result.status === "ANALYZED"
                ? "le document semble correspondre"
                : documentStatusLabel(result.status).toLowerCase()}
            </span>
          </p>
          {result.reason ? <p className="mt-1 text-sm text-text2">{result.reason}</p> : null}
          {result.observations?.length ? (
            <ul className="mt-2 space-y-1 text-sm text-text2">
              {result.observations.map((o, i) => (
                <li key={i}>• {o}</li>
              ))}
            </ul>
          ) : null}
          <p className="mt-2 text-sm text-text2">
            {result.requiresHumanReview
              ? "Une vérification humaine peut être nécessaire avant toute utilisation officielle."
              : "Analyse automatique : pas de certification officielle."}
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button
              className="w-full"
              variant="gradient"
              onClick={() => router.push(`/app/next-action?journey=${encodeURIComponent(journeyId)}`)}
            >
              Voir la prochaine action
              <ArrowRightIcon className="h-5 w-5" />
            </Button>
            <Button
              className="w-full"
              variant="secondary"
              onClick={() => router.push(`/app/dossier/${journeyId}`)}
            >
              Retourner au dossier
            </Button>
          </div>
        </GlassCard>
      ) : null}
    </section>
  );
}