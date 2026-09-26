"use client";

/**
 * Écran 6 — Prochaine action, et dernière étape du parcours (« Agir »).
 *
 * L'état vient du SERVEUR (GET resume via useJourneyState) : avant, l'écran était
 * vide à l'ouverture directe ou après un rechargement, faute d'état en cache.
 * Dossier complet (CONTACT_SERVICE) → écran de fin : récapitulatif des pièces,
 * service officiel (source réelle, GET /api/evidence) et limites. Aucune
 * information administrative n'est inventée (adresse, horaires, frais) : on
 * renvoie vers la source officielle.
 */
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { JOURNEY_STATUS_LABEL } from "@sama/shared/gen/enums";
import { Button, ErrorNotice, GlassCard, ThinkingDots } from "@/components/ui";
import {
  ArrowRightIcon,
  BuildingIcon,
  CheckIcon,
  FlagIcon,
  HomeIcon,
} from "@/components/icons";
import { NextActionCard } from "@/components/journey/NextActionCard";
import { useJourneyStore } from "@/lib/state/stores";
import { useAuth } from "@/lib/auth/auth-context";
import { journeyIdFor } from "@/lib/auth/journey-id";
import { useJourneyState } from "@/lib/query/journey-state";
import { useEvidence } from "@/lib/query/hooks";
import { documentStatusLabel, procedureLabel, requirementLabel } from "@/lib/labels";
import type { JourneyResponse } from "@/lib/schemas";

export default function ProchaineActionPage() {
  const search = useSearchParams();
  const { user } = useAuth();
  const cachedId = useJourneyStore((s) => s.response?.journeyId);
  const journeyId =
    search.get("journey") ?? cachedId ?? journeyIdFor("driving_license_new", user?.id);
  const { journey, failed, error, retry } = useJourneyState(journeyId);

  if (!journey) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        {failed ? (
          <>
            <ErrorNotice error={error} action="La lecture du dossier" onRetry={retry} className="w-full max-w-md" />
            <Link href="/app/home">
              <Button variant="secondary">Retour à l'accueil</Button>
            </Link>
          </>
        ) : (
          <ThinkingDots label="Chargement de votre prochaine action…" />
        )}
      </div>
    );
  }

  return journey.status === "READY_FOR_NEXT_STEP" ? (
    <FinalStep journey={journey} />
  ) : (
    <NextStep journey={journey} />
  );
}

function StepBadge({ children }: { children: React.ReactNode }) {
  return (
    <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-semibold uppercase tracking-widest text-accent-ai">
      {children}
    </p>
  );
}

/** Dossier incomplet ou à vérifier : UNE action claire, et ce qu'il reste. */
function NextStep({ journey }: { journey: JourneyResponse }) {
  const target = journey.nextActionRequirement;
  const remaining = journey.documents.filter((d) => d.status !== "ANALYZED");
  const cta =
    journey.nextAction === "REVIEW_DOCUMENT" ? "Revoir" : "Fournir";

  return (
    <section className="flex flex-col gap-6 pt-8">
      <div>
        <StepBadge>5 · Suite</StepBadge>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Prochaine action</h1>
        <p className="mt-1 text-sm text-text2">
          {procedureLabel(journey.procedureId)} · {JOURNEY_STATUS_LABEL[journey.status]} ·{" "}
          {journey.completion.provided}/{journey.completion.required} pièces analysées
        </p>
      </div>

      <NextActionCard journey={journey} />

      {target ? (
        <Link
          href={`/app/evidence/${encodeURIComponent(target)}?journey=${encodeURIComponent(journey.journeyId)}`}
          className="w-full"
        >
          <Button className="w-full" size="lg" variant="gradient">
            {cta} : {requirementLabel(target, journey)}
            <ArrowRightIcon className="h-5 w-5" />
          </Button>
        </Link>
      ) : null}

      {remaining.length > 1 ? (
        <GlassCard className="p-5">
          <p className="text-sm font-semibold uppercase tracking-wide text-text2">Il reste ensuite</p>
          <ul className="mt-3 space-y-2">
            {remaining
              .filter((d) => d.requirementId !== target)
              .map((d) => (
                <li key={d.requirementId} className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-semibold">{d.name || requirementLabel(d.requirementId)}</span>
                  <span className="text-text2">{documentStatusLabel(d.status)}</span>
                </li>
              ))}
          </ul>
        </GlassCard>
      ) : null}

      <Link href={`/app/dossier/${journey.journeyId}`} className="w-full">
        <Button className="w-full" variant="secondary">
          Voir tout mon dossier
        </Button>
      </Link>
    </section>
  );
}

/** Dernière étape : le dossier est prêt, l'usager agit auprès du service officiel. */
function FinalStep({ journey }: { journey: JourneyResponse }) {
  // Source réelle (data/sources) : la preuve d'une pièce porte le service officiel.
  const evidence = useEvidence(journey.documents[0]?.requirementId);

  return (
    <section className="flex flex-col gap-6 pt-8">
      <div>
        <StepBadge>4 · Agir</StepBadge>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Votre dossier est prêt</h1>
        <p className="mt-1 text-sm text-text2">{procedureLabel(journey.procedureId)}</p>
      </div>

      <GlassCard className="flex items-start gap-4 border-primary/30 p-5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
          <FlagIcon className="h-5 w-5" />
        </span>
        <div>
          <p className="text-lg font-bold">
            {journey.completion.provided}/{journey.completion.required} pièces analysées
          </p>
          <p className="mt-1 text-sm text-text2">
            {journey.nextActionReason ??
              "Toutes les pièces demandées ont été analysées. Prochaine étape : le service compétent."}
          </p>
        </div>
      </GlassCard>

      <GlassCard className="p-5">
        <p className="text-sm font-semibold uppercase tracking-wide text-text2">Récapitulatif</p>
        <ul className="mt-3 space-y-2">
          {journey.documents.map((d) => (
            <li key={d.requirementId} className="flex items-center gap-3 text-sm">
              <CheckIcon className="h-4 w-4 shrink-0 text-primary" />
              <span className="font-semibold">{d.name || requirementLabel(d.requirementId)}</span>
              <span className="ml-auto text-text2">{documentStatusLabel(d.status)}</span>
            </li>
          ))}
        </ul>
      </GlassCard>

      <GlassCard className="p-5">
        <div className="flex items-start gap-3">
          <BuildingIcon className="mt-0.5 h-5 w-5 shrink-0 text-accent-ai" />
          <div className="min-w-0">
            <p className="font-semibold">Déposer votre dossier</p>
            <p className="mt-1 text-sm text-text2">
              Présentez votre dossier au service compétent. Les modalités (rendez-vous, frais,
              originaux à présenter) sont fixées par le service : vérifiez-les sur sa source
              officielle.
            </p>
            {evidence.data ? (
              <p className="mt-3 text-sm">
                <span className="font-semibold">{evidence.data.source}</span>
                {evidence.data.sourceUrl ? (
                  <>
                    {" — "}
                    <a
                      href={evidence.data.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="focus-visible break-all text-accent-ai underline"
                    >
                      {evidence.data.sourceUrl}
                    </a>
                  </>
                ) : null}
              </p>
            ) : null}
          </div>
        </div>
      </GlassCard>

      <div className="rounded-card border border-warning/30 bg-warning/10 p-4 text-sm text-text1">
        <p className="font-semibold text-warning">À savoir</p>
        <p className="mt-1">
          L'analyse de vos pièces par Sama Agent n'est pas une validation administrative
          officielle : la vérification définitive relève du service compétent.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Link href={`/app/dossier/${journey.journeyId}`} className="w-full">
          <Button className="w-full" size="lg" variant="secondary">
            Revoir mon dossier
          </Button>
        </Link>
        <Link href="/app/home" className="w-full">
          <Button className="w-full" size="lg" variant="gradient">
            <HomeIcon className="h-5 w-5" />
            Retour à l'accueil
          </Button>
        </Link>
      </div>
    </section>
  );
}
