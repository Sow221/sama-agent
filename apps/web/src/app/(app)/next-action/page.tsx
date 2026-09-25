"use client";

/**
 * Écran 6 — Prochaine action : la recommandation dérivée par le moteur (ADR-006),
 * avec le lien direct vers l'élément concerné.
 */
import Link from "next/link";
import { Button } from "@/components/ui";
import { NextActionCard } from "@/components/journey/NextActionCard";
import { useJourneyStore } from "@/lib/state/stores";
import { useAuth } from "@/lib/auth/auth-context";
import { journeyIdFor } from "@/lib/auth/journey-id";

export default function ProchaineActionPage() {
  const { response } = useJourneyStore();
  const { user } = useAuth();

  return (
    <section className="flex flex-col gap-6 pt-4">
      <h1 className="text-2xl font-bold">Prochaine action</h1>
      {response ? (
        <>
          <NextActionCard journey={response} />
          {response.nextActionRequirement ? (
            <Link
              href={`/evidence/${encodeURIComponent(response.nextActionRequirement)}?journey=${response.journeyId}`}
              className="w-full"
            >
              <Button className="w-full" size="lg">
                Commencer maintenant
              </Button>
            </Link>
          ) : null}
        </>
      ) : (
        <Link href={`/journey/${journeyIdFor("driving_license_new", user?.id)}`}>
          <Button className="w-full" variant="ghost">
            Voir mon parcours
          </Button>
        </Link>
      )}
    </section>
  );
}