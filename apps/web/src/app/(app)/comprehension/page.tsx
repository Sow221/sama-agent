"use client";

/**
 * Écran 2 — Compréhension : ce que la demande implique (en français),
 * avec les 3 exigences officielles puis le bouton « Voir mon parcours → » (G1).
 * L'identifiant de parcours est PAR-USAGER (journeyIdFor) : deux usagers ne
 * partagent jamais le même dossier (appropriation serveur journeys.user_id).
 */
import { useRouter } from "next/navigation";
import { Button, Card, Spinner } from "@/components/ui";
import { useJourneyMutation } from "@/lib/query/hooks";
import { useJourneyStore } from "@/lib/state/stores";
import { useAuth } from "@/lib/auth/auth-context";
import { journeyIdFor } from "@/lib/auth/journey-id";

/** Procédure de démonstration (report du référentiel officiel data/). */
const PROCEDURE_ID = "driving_license_new";

export default function CompréhensionPage() {
  const router = useRouter();
  const { user } = useAuth();
  const setJourneyResponse = useJourneyStore((s) => s.setResponse);
  const journeyMutation = useJourneyMutation((r) => {
    setJourneyResponse(r);
    router.push(`/journey/${r.journeyId}`);
  });

  const run = () =>
    journeyMutation.mutate({
      journeyId: journeyIdFor(PROCEDURE_ID, user?.id),
      // Clé de procédure explicite : le dossier par-usager porte un suffixe qui
      // n'est pas une procédure du référentiel (moteur : procedureId || journeyId).
      procedureId: PROCEDURE_ID,
    });

  return (
    <section className="flex flex-col gap-6 pt-4">
      <div>
        <h1 className="text-2xl font-bold">Comprendre</h1>
        <p className="mt-1 text-text2">
          Première demande de permis de conduire — Sénégal. Voici les éléments exigés.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <Card>
          <p className="font-semibold text-primary">1. Pièce d'identité</p>
          <p className="mt-1 text-sm text-text2">
            Document officiel d'identité valide.
          </p>
        </Card>
        <Card>
          <p className="font-semibold text-primary">2. Certificat médical</p>
          <p className="mt-1 text-sm text-text2">
            Certificat médical exigé pour la première demande.
          </p>
        </Card>
        <Card>
          <p className="font-semibold text-primary">3. Photographies</p>
          <p className="mt-1 text-sm text-text2">
            Photographies d'identité demandées par le service.
          </p>
        </Card>
      </div>

      {journeyMutation.isError ? (
        <p role="alert" className="text-sm text-danger">
          La récupération du parcours a échoué. Réessayez.
        </p>
      ) : null}

      <Button size="lg" onClick={run} disabled={journeyMutation.isPending} className="w-full">
        {journeyMutation.isPending ? <Spinner /> : "Voir mon parcours →"}
      </Button>
    </section>
  );
}