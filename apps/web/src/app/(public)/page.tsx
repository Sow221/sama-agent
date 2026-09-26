"use client";

/**
 * Welcome — `/` (UI/UX Master Spec §17).
 * Headline courte, description, Voice Core, CTA « Commencer » + « Se connecter ».
 * Le Core est NON interactif ici (vitrine) : il devient action dans l'espace connecté.
 */
import Link from "next/link";
import { useAuth } from "@/lib/auth/auth-context";
import { Button, GlassCard } from "@/components/ui";
import { ArrowRightIcon, CompassIcon, FileIcon, Mic } from "@/components/icons";
import { VoiceCore } from "@/components/voice/VoiceCore";
import { isOnboardingDone } from "@/lib/auth/onboarding";

const STEPS = [
  {
    Icon: Mic,
    title: "Parlez",
    text: "Écrivez votre demande en français ou parlez en wolof : « je veux faire ma première demande de permis ».",
  },
  {
    Icon: CompassIcon,
    title: "Comprenez",
    text: "L'agent vous montre les pièces officielles exigées, avec la source officielle qui les justifie.",
  },
  {
    Icon: FileIcon,
    title: "Agissez",
    text: "Un dossier personnel, suivi étape par étape jusqu'au dépôt — rien que pour vous.",
  },
];

export default function WelcomePage() {
  const { configured, loading, session } = useAuth();
  const ready = !loading;

  // Harnais (auth non configurée) : l'espace s'ouvre directement.
  const startHref =
    !configured && ready
      ? "/app/home"
      : session
        ? isOnboardingDone()
          ? "/app/home"
          : "/onboarding"
        : "/signup";
  const startLabel = session || (!configured && ready) ? "Ouvrir mon espace" : "Commencer";

  return (
    <section className="flex flex-col gap-10 pt-8 pb-6">
      <div className="text-center">
        <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3.5 py-1.5 text-xs font-semibold uppercase tracking-widest text-accent-ai">
          <span className="inline-block h-2 w-2 rounded-full bg-primary animate-pulse" />
          Assistant administratif vocal — Sénégal
        </p>
        <h1 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight">
          Parlez. Comprenez.{" "}
          <span className="text-gradient">Agissez.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-md text-base text-text2">
          Parlez en wolof, lisez en français. Comprendre les démarches administratives et les suivre
          jusqu'au bout — sans simulation.
        </p>

        {/* Voice Core : reconnaissance, action centrale du produit */}
        <div className="mt-8 flex justify-center">
          <VoiceCore state="idle" size="lg" interactive={false} ariaLabel="Sama Agent" />
        </div>

        <div className="mt-8 flex flex-col gap-3">
          <Link href={startHref} className="w-full focus-visible">
            <Button variant="gradient" size="lg" className="w-full">
              {startLabel}
              <ArrowRightIcon className="h-5 w-5" />
            </Button>
          </Link>
          <Link href="/login" className="w-full focus-visible">
            <Button variant="secondary" size="lg" className="w-full">
              Se connecter
            </Button>
          </Link>
          <a
            href="#comment"
            className="focus-visible w-full rounded-full border border-surface-2 bg-surface px-6 py-4 text-center text-lg font-semibold text-text1 transition-transform active:scale-[0.98]"
          >
            Comment ça marche
          </a>
        </div>
      </div>

      <div id="comment" className="flex scroll-mt-24 flex-col gap-3">
        <h2 className="text-center text-2xl font-extrabold tracking-tight">
          En <span className="text-gradient">3 étapes</span>
        </h2>
        {STEPS.map((s, i) => (
          <GlassCard key={s.title} className="flex items-start gap-4 p-5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-accent-ai">
              <s.Icon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold uppercase tracking-widest text-primary">
                Étape {i + 1} — {s.title}
              </p>
              <p className="mt-1.5 text-text2">{s.text}</p>
            </div>
          </GlassCard>
        ))}
      </div>

      <GlassCard className="flex flex-col items-center gap-4 p-7 text-center">
        <h2 className="text-2xl font-extrabold tracking-tight">
          Prêt à démarrer votre démarche ?
        </h2>
        <p className="text-sm text-text2">
          Créez votre compte en une minute. Votre dossier vous appartient.
        </p>
        <Link href={startHref} className="w-full focus-visible">
          <Button variant="gradient" size="lg" className="w-full">
            {startLabel === "Commencer" ? "Créer un compte / Se connecter" : startLabel}
            <ArrowRightIcon className="h-5 w-5" />
          </Button>
        </Link>
        <Link
          href="/limits"
          className="focus-visible text-sm text-text2 underline underline-offset-4"
        >
          Ce que l'application peut et ne peut pas faire
        </Link>
      </GlassCard>
    </section>
  );
}