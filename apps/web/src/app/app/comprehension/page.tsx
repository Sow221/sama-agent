"use client";

/**
 * Écran 2 — Compréhension : ce que la demande implique (en français),
 * avec les 3 exigences officielles puis le bouton « Voir mon parcours → » (G1).
 * L'identifiant de parcours est PAR-USAGER (journeyIdFor) : deux usagers ne
 * partagent jamais le même dossier (appropriation serveur journeys.user_id).
 *
 * ⚠ Cet écran affichait auparavant un texte figé — « Première demande de permis
 * de conduire — Sénégal » — et les mêmes 3 exigences pour tout le monde, quelle
 * que soit la demande. La réponse de `/api/intent` était jetée par l'écran
 * précédent. Il affichait donc une première demande à quelqu'un qui demandait
 * un renouvellement, et n'affichait jamais les questions de précision que le
 * serveur produit (`needsClarification` / `clarificationQuestion`).
 * Le texte vient maintenant de ce que le serveur a réellement compris, et un
 * dossier ne s'ouvre pas tant que la demande n'est pas reconnue.
 */
import { useRouter } from "next/navigation";
import { INTENT, INTENT_ACTION } from "@sama/shared/gen/enums";
import { Button, ErrorNotice, GlassCard, Hydrating, ThinkingDots } from "@/components/ui";
import { ArrowRightIcon } from "@/components/icons";
import { useJourneyMutation } from "@/lib/query/hooks";
import { useCreateConversation } from "@/lib/query/conversations";
import { useJourneyStore, usePersistReady } from "@/lib/state/stores";
import { useAuth } from "@/lib/auth/auth-context";
import { journeyIdFor } from "@/lib/auth/journey-id";
import { BrandTon } from "@/components/brand/Logo";

/** Procédure de démonstration (report du référentiel officiel data/). */
const PROCEDURE_ID = "driving_license_new";

/** Restitution en français de ce que le moteur a reconnu. */
const GOT_LABEL: Record<(typeof INTENT)[number], string> = {
  driving_license: "permis de conduire",
};

const ACTION_LABEL: Record<(typeof INTENT_ACTION)[number], string> = {
  new_application: "première demande",
  renewal: "renouvellement",
  unknown: "demande non identifiée",
};

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
  const understood = useJourneyStore((s) => s.intent);
  // Sans cette attente, un rechargement direct de l'URL affiche brièvement
  // « Demande non renseignée » puis bascule : le store persisté arrive APRÈS le
  // premier rendu. On ne montre un état que lorsqu'on sait qu'il est définitif.
  const ready = usePersistReady();
  const journeyMutation = useJourneyMutation((r) => {
    setJourneyResponse(r);
    router.push(`/app/journey/${r.journeyId}`);
  });

  // Demande hors parcours guidé (passeport, extrait, casier…) : l'agent y répond
  // quand même, en conversation libre avec recherche web et sources.
  const createConversation = useCreateConversation();
  const askAgent = async () => {
    const transcript = understood?.transcript?.trim();
    if (!transcript) return;
    const c = await createConversation.mutateAsync({ title: transcript.slice(0, 80) });
    router.push(`/app/chats/${c.id}?q=${encodeURIComponent(transcript)}`);
  };

  const run = () =>
    journeyMutation.mutate({
      journeyId: journeyIdFor(PROCEDURE_ID, user?.id),
      // Clé de procédure explicite : le dossier par-usager porte un suffixe qui
      // n'est pas une procédure du référentiel (moteur : procedureId || journeyId).
      procedureId: PROCEDURE_ID,
    });

  const pending = journeyMutation.isPending;
  if (!ready) return <Hydrating label="Lecture de votre demande…" />;
  // Ce que le serveur a réellement compris. `null` = on est arrivé ici sans
  // passer par l'accueil (lien direct, rechargement de session).
  const got = understood?.response;
  // Le serveur demande une précision : avancer ouvrirait un dossier qui ne
  // correspond pas à la demande. On ne propose donc PAS de continuer.
  const mustClarify = got?.needsClarification === true;
  const question = got?.clarificationQuestion?.trim() || "";

  return (
    <section className="flex flex-col gap-6 pt-8">
      <div>
        <p className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold uppercase tracking-widest text-accent-ai">
          <BrandTon className="h-2.5 w-auto text-primary" />
          Étape 1 · Comprendre
        </p>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight">Votre demande</h1>
      </div>

      {/* Ce que l'usager a réellement dit, et ce que le serveur en a compris. */}
      <GlassCard className="p-5">
        {understood ? (
          <>
            <p className="text-xs font-semibold uppercase tracking-wide text-text2">
              Votre demande
            </p>
            <p className="mt-2 text-lg font-semibold leading-snug">
              « {understood.transcript} »
            </p>
            <p className="mt-3 text-sm text-text2">
              Demande reconnue&nbsp;: <strong>{GOT_LABEL[got!.intent]}</strong> —{" "}
              {ACTION_LABEL[got!.action]}
              {got!.confidence > 0 ? (
                <> · confiance {Math.round(got!.confidence * 100)}&nbsp;%</>
              ) : null}
            </p>
          </>
        ) : (
          <>
            <p className="text-xs font-semibold uppercase tracking-wide text-text2">
              Demande non renseignée
            </p>
            <p className="mt-2 text-sm text-text2">
              Aucune demande n&apos;a été analysée dans cette session. Décrivez-la
              d&apos;abord pour que l&apos;agent travaille sur votre situation réelle
              plutôt que sur un cas d&apos;exemple.
            </p>
            <Button
              variant="secondary"
              className="mt-3"
              onClick={() => router.push("/app/home")}
            >
              Décrire ma demande
            </Button>
          </>
        )}
      </GlassCard>

      {/* Précision demandée par le serveur : on bloque, on ne devine pas. */}
      {mustClarify ? (
        <div
          role="status"
          data-testid="clarification"
          className="flex flex-col items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4"
        >
          <p className="text-sm font-semibold text-warning">
            {question || "Pouvez-vous préciser votre demande ?"}
          </p>
          <p className="text-xs text-text-muted">
            Cette demande n&apos;a pas encore de parcours guidé pas à pas. L&apos;agent
            peut quand même vous répondre, avec des sources vérifiables.
          </p>
          <div className="flex flex-wrap gap-2">
            {understood?.transcript ? (
              <Button variant="gradient" size="sm" onClick={askAgent} loading={createConversation.isPending}>
                Poser la question à l&apos;agent
              </Button>
            ) : null}
            <Button variant="secondary" size="sm" onClick={() => router.push("/app/home")}>
              Préciser ma demande
            </Button>
          </div>
        </div>
      ) : null}

      {mustClarify ? null : (
        <>
          <GlassCard className="p-5">
            <p className="text-sm font-semibold text-primary">Éléments officiels exigés</p>
            <div className="mt-4 flex flex-col gap-3">
              {REQUIREMENTS.map((r) => (
                <div key={r.n} className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent-ai text-base font-extrabold text-on-primary">
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
            <ErrorNotice
              error={journeyMutation.error}
              action="L'ouverture de votre parcours"
              onRetry={run}
            />
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
        </>
      )}
    </section>
  );
}