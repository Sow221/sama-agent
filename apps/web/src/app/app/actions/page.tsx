"use client";

/**
 * Actions — `/app/actions` (UI/UX Master Spec §26 Actions).
 * Les actions RÉELLES de votre parcours : étapes du moteur (statuts serveur) et
 * prochaine action issue de `nextAction` — jamais générées côté client.
 */
import { documentStatusLabel, procedureLabel, requirementLabel } from "@/lib/labels";
import Link from "next/link";
import { Button, Card, EmptyState, Hydrating } from "@/components/ui";
import { ActionIcon, ArrowRightIcon, CheckIcon } from "@/components/icons";
import { useJourneyStore, usePersistReady } from "@/lib/state/stores";

export default function ActionsPage() {
  const journey = useJourneyStore((s) => s.response);
  const ready = usePersistReady();

  // Le garde-fou reste (ne pas lire un store non hydraté) : c'est le rendu qui
  // affichait un écran VIDE, pas un chargement.
  if (!ready) return <Hydrating />;

  if (!journey) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-3xl font-extrabold tracking-tight">Actions</h1>
        <EmptyState
          emoji={<ActionIcon className="h-9 w-9" />}
          title="Aucune action pour l'instant"
          description="Commencez un parcours : l'agent établit la liste des pièces et les étapes à suivre, que vous retrouverez ici."
          action={
            <Link href="/app/home" className="focus-visible">
              <Button variant="gradient" size="lg">Décrire ma démarche</Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Actions</h1>
        <p className="mt-1 text-sm text-text2">
          {procedureLabel(journey.procedureId)} — étapes calculées à partir de votre dossier.
        </p>
      </div>

      {journey.nextActionLabel ? (
        <div className="flex items-start gap-3 rounded-xl border border-primary-soft bg-primary/10 p-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <ActionIcon className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-primary">
              Action suivante
            </p>
            <p className="mt-1 font-bold">{journey.nextActionLabel}</p>
            {journey.nextActionReason ? (
              <p className="mt-0.5 text-sm text-text2">{journey.nextActionReason}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      <Card className="p-2">
        <ol className="flex flex-col gap-1">
          {journey.steps.map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-3 rounded-lg px-4 py-3"
              aria-current={s.status === "active" ? "step" : undefined}
            >
              <span
                aria-hidden
                className={
                  s.status === "done"
                    ? "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-success/20 text-success"
                    : s.status === "active"
                      ? "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary"
                      : "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-text-muted"
                }
              >
                {s.status === "done" ? <CheckIcon className="h-4 w-4" /> : s.order}
              </span>
              <span className="flex-1 text-base font-semibold">{s.name}</span>
              <span className="text-xs font-medium uppercase tracking-widest text-text-muted">
                {s.status === "done" ? "Fait" : s.status === "active" ? "En cours" : "À faire"}
              </span>
            </li>
          ))}
        </ol>
      </Card>

      <Link href={`/app/journey/${journey.journeyId}`} className="focus-visible">
        <Button variant="secondary" className="w-full">
          Voir le parcours détaillé
          <ArrowRightIcon className="h-4 w-4" />
        </Button>
      </Link>
    </div>
  );
}