"use client";

/**
 * Écran 1 — Accueil (G9 : saisie texte + micro) :
 * on peut écrire sa demande (français) ou parler (wolof via l'écran Voice).
 * La demande part vers /api/intent (LLM réel, NVIDIA) puis on entre dans le parcours.
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Spinner } from "@/components/ui";
import { VoiceButton } from "@/components/voice/VoiceButton";
import { useIntentMutation } from "@/lib/query/hooks";
import { useJourneyStore } from "@/lib/state/stores";

export default function AccueilPage() {
  const router = useRouter();
  const [text, setText] = useState("");
  const setJourneyResponse = useJourneyStore((s) => s.setResponse);

  const intentMutation = useIntentMutation(() => {
    router.push("/comprehension");
  });

  const canSubmit = useMemo(() => text.trim().length > 0, [text]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || intentMutation.isPending) return;
    intentMutation.mutate({ transcript: text.trim(), language: "fr" });
  }

  return (
    <section className="flex flex-col gap-8 pt-8">
      <div className="text-center">
        <p className="text-sm font-medium uppercase tracking-widest text-accent-ai">
          Votre parcours administratif, à la voix
        </p>
        <h1 className="mt-2 text-3xl font-bold">
          Décrivez votre démarche, <span className="text-primary">Sama Agent</span> vous guide.
        </h1>
        <p className="mt-3 text-text2">
          Parlez en wolof, lisez en français. Aucune simulation : chaque réponse vient de la vraie
          chaîne (reconnaissance vocale + IA).
        </p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="Ex. : je veux faire ma première demande de permis de conduire"
          aria-label="Votre demande"
          className="focus-visible w-full resize-none rounded-2xl bg-surface border border-surface-2 p-4 text-base text-text1 placeholder:text-text2"
        />
        <Button type="submit" disabled={!canSubmit || intentMutation.isPending}>
          {intentMutation.isPending ? <Spinner /> : "Commencer"}
        </Button>
        {intentMutation.isError ? (
          <p role="alert" className="text-sm text-danger">
            L'analyse de la demande a échoué. Réessayez.
          </p>
        ) : null}
      </form>

      <div className="flex flex-col items-center gap-2">
        <VoiceButton
          onPress={() => router.push("/voice")}
          disabled={intentMutation.isPending}
        />
        <p className="text-sm text-text2">
          Ou appuyez sur le micro pour parler en wolof.
        </p>
      </div>
    </section>
  );
}