"use client";

/**
 * Écran 1 — Accueil (G9 : saisie texte + micro) :
 * on peut écrire sa demande (français) ou parler (wolof via l'écran Voice).
 * La demande part vers /api/intent (LLM réel, NVIDIA) puis on entre dans le parcours.
 * Design : langage « écoute IA » du kit, identité vert/bleu conservée — chaque état
 * (pending, erreur) est piloté par la vraie chaîne, jamais pré-réglé.
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, GlassCard, ThinkingDots } from "@/components/ui";
import { ArrowRightIcon } from "@/components/icons";
import { VoiceButton } from "@/components/voice/VoiceButton";
import { useIntentMutation } from "@/lib/query/hooks";
import { useJourneyStore } from "@/lib/state/stores";

export default function AccueilPage() {
  const router = useRouter();
  const [text, setText] = useState("");
  const journeyId = useJourneyStore((s) => s.response?.journeyId);

  const intentMutation = useIntentMutation(() => {
    router.push("/comprehension");
  });

  const canSubmit = useMemo(() => text.trim().length > 0, [text]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || intentMutation.isPending) return;
    intentMutation.mutate({ transcript: text.trim(), language: "fr" });
  }

  const pending = intentMutation.isPending;

  return (
    <section className="flex flex-col gap-8 pt-8">
      <div className="text-center">
        <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3.5 py-1.5 text-xs font-semibold uppercase tracking-widest text-accent-ai">
          <span className="inline-block h-2 w-2 rounded-full bg-primary animate-pulse" />
          Assistant administratif vocal
        </p>
        <h1 className="mt-4 text-4xl font-extrabold leading-tight tracking-tight">
          Décrivez votre démarche,{" "}
          <span className="text-gradient">Sama Agent</span> vous guide.
        </h1>
        <p className="mt-3 text-base text-text2">
          Parlez en wolof, lisez en français. Aucune simulation : chaque réponse
          vient de la vraie chaîne (reconnaissance vocale + IA).
        </p>
      </div>

      <GlassCard className="p-5">
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="Ex. : je veux faire ma première demande de permis de conduire"
            aria-label="Votre demande"
            className="focus-visible w-full resize-none rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-base text-text1 placeholder:text-text2 backdrop-blur-md"
          />
          <Button type="submit" variant="gradient" size="lg" disabled={!canSubmit || pending} className="w-full">
            {pending ? (
              <ThinkingDots label="J'analyse votre demande…" />
            ) : (
              <>
                Commencer
                <ArrowRightIcon className="h-5 w-5" />
              </>
            )}
          </Button>
          {intentMutation.isError ? (
            <p role="alert" className="text-sm text-danger">
              L'analyse de la demande a échoué. Réessayez.
            </p>
          ) : null}
        </form>
      </GlassCard>

      <div className="grid grid-cols-3 gap-3">
        <Link href="/comprehension" className="focus-visible rounded-card border border-white/10 bg-white/[0.05] p-4 transition-colors hover:border-primary/40">
          <span className="text-xl leading-none">🧭</span>
          <p className="mt-2 text-sm font-semibold">Comprendre</p>
          <p className="mt-0.5 text-xs text-text2">Ce que la démarche implique</p>
        </Link>
        <Link href="/voice" className="focus-visible rounded-card border border-white/10 bg-white/[0.05] p-4 transition-colors hover:border-accent-ai/40">
          <span className="text-xl leading-none">🗣️</span>
          <p className="mt-2 text-sm font-semibold">Parler</p>
          <p className="mt-0.5 text-xs text-text2">Votre demande à la voix</p>
        </Link>
        {journeyId ? (
          <Link href={`/dossier/${journeyId}`} className="focus-visible rounded-card border border-white/10 bg-white/[0.05] p-4 transition-colors hover:border-primary/40">
            <span className="text-xl leading-none">📁</span>
            <p className="mt-2 text-sm font-semibold">Suivre</p>
            <p className="mt-0.5 text-xs text-text2">Votre dossier en cours</p>
          </Link>
        ) : (
          <div className="rounded-card border border-white/[0.06] bg-white/[0.03] p-4 opacity-60">
            <span className="text-xl leading-none">📁</span>
            <p className="mt-2 text-sm font-semibold">Suivre</p>
            <p className="mt-0.5 text-xs text-text2">Après le début du parcours</p>
          </div>
        )}
      </div>

      <div className="flex flex-col items-center gap-2">
        <VoiceButton onPress={() => router.push("/voice")} disabled={pending} />
        <p className="text-sm text-text2">Ou appuyez sur le micro pour parler en wolof.</p>
      </div>
    </section>
  );
}