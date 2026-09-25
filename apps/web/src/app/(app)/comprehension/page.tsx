"use client";

/**
 * Écran 2 — Compréhension : ce que la demande implique (en français),
 * avec les 3 exigences officielles puis le bouton « Voir mon parcours → » (G1).
 * L'identifiant de parcours est PAR-USAGER (journeyIdFor) : deux usagers ne
 * partagent jamais le même dossier (appropriation serveur journeys.user_id).
 */
import { useRouter } from "next/navigation";
import { Button, GlassCard, ThinkingDots } from "@/components/ui";
import { ArrowRightIcon } from "@/components/icons";
import { useJourneyMutation } from "@/lib/query/hooks";
import { useJourneyStore } from "@/lib/state/stores";
import { useAuth } from "@/lib/auth/auth-context";
import { journeyIdFor } from "@/lib/auth/journey-id";

/** Procédure de démonstration (report du référentiel officiel data/). */
const PROCEDURE_ID = "driving_license_new";

const REQUIREMENTS: { n: string; title: string; desc: string }[] = [
  {
    n: "1",
    title: "Pièce d'identité",
    desc: "Document officiel d'identité valide.",
  },
  {
    n: "2",
    title: "Certificat médical",
    desc: "Certificat médical exigé pour la première demande.",
  },
  {
    n: "3",
    title: "Photographies",
    desc: "Photographies d'identité demandées par le service.",
  },
];

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

  const pending = journeyMutation.isPending;

  return (
    <section className="flex flex-col gap-6 pt-8">
      <div>
        <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-semibold uppercase tracking-widest text-accent-ai">
          1 · Comprendre
        </p>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight">Votre demande</h1>
        <p className="mt-2 text-base text-text2">
          Première demande de permis de conduire — Sénégal. Voici les éléments exigés.
        </p>
      </div>

      <GlassCard className="p-5">
        <p className="text-sm font-semibold text-primary">Éléments officiels exigés</p>
        <div className="mt-4 flex flex-col gap-3">
          {REQUIREMENTS.map((r) => (
            <div key={r.n} className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent-ai text-base font-extrabold text-[#04211a]">
                {r.n}
              </span>
              <div>
                <p className="font-semibold">{r.title}</p>
                <p className="text-sm text-text2">{r.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </GlassCard>

      {journeyMutation.isError ? (
        <p role="alert" className="text-sm text-danger">
          La récupération du parcours a échoué. Réessayez.
        </p>
      ) : null}

      <Button
        size="lg"
        variant="gradient"
        onClick={run}
        disabled={pending}
        className="w-full"
      >
        {pending ? (
          <ThinkingDots label="Ouverture de votre parcours…" />
        ) : (
          <>
            Voir mon parcours
            <ArrowRightIcon className="h-5 w-5" />
          </>
        )}
      </Button>
    </section>
  );
}