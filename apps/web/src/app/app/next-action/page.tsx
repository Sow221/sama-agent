"use client";

/**
 * Écran 6 — Prochaine action : la recommandation dérivée par le moteur (ADR-006),
 * avec le lien direct vers l'élément concerné.
 */
import Link from "next/link";
import { Button } from "@/components/ui";
import { ArrowRightIcon } from "@/components/icons";
import { NextActionCard } from "@/components/journey/NextActionCard";
import { useJourneyStore } from "@/lib/state/stores";
import { useAuth } from "@/lib/auth/auth-context";
import { journeyIdFor } from "@/lib/auth/journey-id";

export default function ProchaineActionPage() {
  const { response } = useJourneyStore();
  const { user } = useAuth();

  return (
    <section className="flex flex-col gap-6 pt-8">
      <div>
        <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-semibold uppercase tracking-widest text-accent-ai">
          5 · Suite
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Prochaine action</h1>
        <p className="mt-1 text-sm text-text2">Recommandée d'après votre dossier.</p>
      </div>
      {response ? (
        <>
          <NextActionCard journey={response} />
          {response.nextActionRequirement ? (
            <Link
              href={`/app/evidence/${encodeURIComponent(response.nextActionRequirement)}?journey=${response.journeyId}`}
              className="w-full"
            >
              <Button className="w-full" size="lg" variant="gradient">
                Commencer maintenant
                <ArrowRightIcon className="h-5 w-5" />
              </Button>
            </Link>
          ) : null}
        </>
      ) : (
        <Link href={`/app/journey/${journeyIdFor("driving_license_new", user?.id)}`}>
          <Button className="w-full" variant="ghost">
            Voir mon parcours
          </Button>
        </Link>
      )}
    </section>
  );
}