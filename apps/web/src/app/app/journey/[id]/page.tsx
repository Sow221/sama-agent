"use client";

/**
 * Écran 3 — Parcours (G7) : 4 étapes + état + bouton vers le dossier.
 * Les données viennent du moteur déterministe (completion TOUJOURS dérivée, G3).
 */
import Link from "next/link";
import { useParams } from "next/navigation";
import { JOURNEY_STATUS_LABEL, type JOURNEY_STATUS } from "@sama/shared/gen/enums";
import { Button, ErrorNotice, GlassCard, ThinkingDots, StatusPill, type BadgeTone } from "@/components/ui";
import { JourneySteps } from "@/components/journey/JourneySteps";
import { NextActionCard } from "@/components/journey/NextActionCard";
import { AskAgentButton } from "@/components/journey/AskAgentButton";
import { ArrowRightIcon } from "@/components/icons";
import { useJourneyState } from "@/lib/query/journey-state";
import { BrandTon } from "@/components/brand/Logo";

/** Pourquoi un élément bloque (point 20 — « ce qui manque / pourquoi »). */
const STATUS_WHY: Record<string, string> = {
  MISSING: "à fournir",
  PROVIDED: "fourni, analyse en cours",
  NEEDS_REVIEW: "à vérifier par le service",
  UNEXPECTED: "inattendu, à remplacer",
  UNKNOWN: "non déterminable",
};

/**
 * Pastille d'état réel du parcours (dérivée par le moteur).
 *
 * ⚠ Cette table était cléée `not_started / in_progress / needs_action /
 * completed` — en minuscules, et `needs_action`/`completed` n'existent pas dans
 * l'énumération. Résultat mesuré : `STATUS_TONE[response.status]` valait
 * toujours `undefined`, donc **toute** pastille tombait sur `?? "neutral"` :
 * l'écran affichait un dossier complet en gris comme un dossier bloqué. Aucun
 * test ne l'avait vu, car la pastille reste « valide » syntactiquement.
 *
 * Le type est maintenant `Record<JOURNEY_STATUS, …>` : le moteur compile
 * ÉCHOUCÉ dès qu'un statut est ajouté à l'énumération, donc la table ne peut
 * plus dériver en silence. Les clés sont les valeurs de l'énumération, en majuscules.
 */
export const STATUS_TONE: Record<JOURNEY_STATUS, BadgeTone> = {
  NOT_STARTED: "neutral",
  IN_PROGRESS: "warn",
  NEEDS_INFORMATION: "danger",
  NEEDS_DOCUMENT: "warn",
  NEEDS_REVIEW: "danger",
  READY_FOR_NEXT_STEP: "ok",
  OUT_OF_SCOPE: "neutral",
};

export default function ParcoursPage() {
  const params = useParams<{ id: string }>();
  const journeyId = params.id;
  const { journey: response, failed, error, retry } = useJourneyState(journeyId);

  if (!response) {
    return (
      <div className="flex justify-center py-16">
        {failed ? (
          <ErrorNotice error={error} action="La lecture du parcours" onRetry={retry} className="w-full max-w-md" />
        ) : (
          <ThinkingDots label="Chargement de votre parcours…" />
        )}
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-6 pt-8">
      {/* Mobile : la pastille passe sous le titre au lieu de se couper sur deux lignes. */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold uppercase tracking-widest text-accent-ai">
          <BrandTon className="h-2.5 w-auto text-primary" />
            Suivi du parcours
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Votre parcours</h1>
        </div>
        {/* Le libellé vient de l'énumération partagée (source unique ADR-006).
            Avant : `status.replaceAll("_", " ")` affichait « NEEDS DOCUMENT »,
            « READY FOR NEXT STEP » — des identifiants de moteur, pas du français. */}
        <StatusPill
          label={JOURNEY_STATUS_LABEL[response.status]}
          tone={STATUS_TONE[response.status]}
        />
      </div>

      <JourneySteps steps={response.steps} />

      <GlassCard className="flex flex-col items-center gap-1 p-6 text-center">
        <p className="text-sm uppercase tracking-wide text-text2">Dossier</p>
        {/* Le nombre et son dénominateur sont dans deux éléments distincts (pour
            l'œil), donc « 0/3 » n'existe comme texte d'aucun seul nœud : ni
            lecteur d'écran ni test ne pouvait le lire. `aria-label` restitue la
            phrase entière, et data-testid donne un point d'ancrage stable. */}
        <p
          data-testid="completion"
          role="group"
          aria-label={`${response.completion.provided} sur ${response.completion.required} éléments fournis`}
          className="text-5xl font-extrabold tracking-tight text-gradient"
        >
          {response.completion.provided}
          <span className="text-2xl text-text2">/{response.completion.required}</span>
        </p>
        <p className="text-sm text-text2">éléments fournis</p>
      </GlassCard>

      {(() => {
        const pending = response.documents.filter((d) => d.status !== "ANALYZED");
        if (!pending.length) return null;
        return (
          <div className="rounded-card border border-border bg-white/[0.04] p-4">
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
              href={`/app/dossier/${journeyId}`}
              className="focus-visible mt-3 inline-block text-sm font-medium text-accent-ai"
            >
              Voir les documents concernés ›
            </Link>
          </div>
        );
      })()}

      <NextActionCard journey={response} />

      <div className="flex flex-col gap-2 sm:flex-row">
        <Link href={`/app/dossier/${journeyId}`} className="w-full">
          <Button className="w-full" size="lg" variant="gradient">
            Voir mon dossier
            <ArrowRightIcon className="h-5 w-5" />
          </Button>
        </Link>
        <Link href={`/app/next-action?journey=${encodeURIComponent(journeyId)}`} className="w-full">
          <Button className="w-full" size="lg" variant="secondary">
            Prochaine action
          </Button>
        </Link>
      </div>
      <AskAgentButton journeyId={journeyId} procedureId={response.procedureId} />
    </section>
  );
}