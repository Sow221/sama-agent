"use client";

/**
 * Home — `/app/home` (UI/UX Master Spec §28, §115-116).
 * Greeting, Core (action centrale), « Sur quoi travaillons-nous aujourd'hui ? »,
 * saisie texte réelle (intent NVIDIA) et parcours/récents réels (store de session).
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Card, ErrorNotice, Textarea } from "@/components/ui";
import { ArrowRightIcon } from "@/components/icons";
import { VoiceCore } from "@/components/voice/VoiceCore";
import { useIntentMutation } from "@/lib/query/hooks";
import { useJourneyStore, usePersistReady } from "@/lib/state/stores";

export default function HomePage() {
  const router = useRouter();
  const [text, setText] = useState("");
  const journey = useJourneyStore((s) => s.response);
  const setIntent = useJourneyStore((s) => s.setIntent);
  const ready = usePersistReady();

  const intent = useIntentMutation((r) => {
    // La réponse du serveur était jetée : on ne gardait que le `push`. On la
    // conserve pour que l'écran suivant montre ce qui a été compris de la
    // demande — y compris, et surtout, quand il faut préciser.
    setIntent({ response: r, transcript: text.trim() });
    router.push("/app/comprehension");
  });

  const canSubmit = useMemo(() => text.trim().length > 0 && !intent.isPending, [text, intent.isPending]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    intent.mutate({ transcript: text.trim(), language: "fr" });
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="text-center">
        <h1 className="text-3xl font-extrabold tracking-tight">
          Sur quoi travaillons-nous <span className="text-gradient">aujourd'hui</span> ?
        </h1>
        <p className="mx-auto mt-2 max-w-md text-base text-text2">
          Parlez en wolof ou écrivez en français : chaque réponse vient de la vraie chaîne,
          jamais d'une simulation.
        </p>
      </div>

      {/* Voice Core — action centrale */}
      <div className="flex flex-col items-center gap-4">
        <VoiceCore
          state={intent.isPending ? "processing" : "idle"}
          size="lg"
          onPress={() => router.push("/app/voice")}
          ariaLabel="Parler à Sama Agent"
        />
        <Button variant="gradient" size="lg" onClick={() => router.push("/app/voice")}>
          Parler à Sama Agent
        </Button>
      </div>

      {/* Saisie texte (composer accueil) */}
      <Card>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="Ex. : je veux faire ma première demande de permis de conduire"
            aria-label="Votre demande"
          />
          <Button
            type="submit"
            variant="gradient"
            size="lg"
            disabled={!canSubmit}
            loading={intent.isPending}
            className="w-full"
          >
            {!intent.isPending ? (
              <>
                Commencer le parcours
                <ArrowRightIcon className="h-5 w-5" />
              </>
            ) : null}
          </Button>
          {intent.isError ? (
            <ErrorNotice
              error={intent.error}
              action="L'analyse de la demande"
              onRetry={() => intent.mutate({ transcript: text.trim(), language: "fr" })}
            />
          ) : null}
        </form>
      </Card>

      {/* Récente (données réelles de session) */}
      {journey && ready ? (
        <div className="flex flex-col gap-3">
          <h2 className="text-xl font-extrabold tracking-tight">Votre parcours en cours</h2>
          <Link href={`/app/chats/${journey.journeyId}`} className="focus-visible">
            <Card className="transition-colors hover:border-primary/40">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-base font-bold">{journey.procedureId}</p>
                  <p className="mt-0.5 text-sm text-text2">
                    {journey.nextActionLabel ?? "Étape suivante à venir"}
                  </p>
                </div>
                <span className="shrink-0 rounded-full border border-accent-ai/30 bg-accent-soft px-3 py-1 text-sm font-semibold text-accent-ai">
                  En cours
                </span>
              </div>
              <div className="mt-3">
                <div className="mb-1 flex justify-between text-xs text-text-muted">
                  <span>Progression</span>
                  <span>{Math.round(journey.completion.ratio * 100)}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-surface-elevated">
                  <div
                    className="h-full rounded-full bg-success transition-all duration-ui"
                    style={{ width: `${journey.completion.ratio * 100}%` }}
                  />
                </div>
              </div>
            </Card>
          </Link>
        </div>
      ) : null}
    </div>
  );
}