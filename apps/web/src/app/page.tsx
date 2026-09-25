"use client";

/**
 * Landing public — `/` (vitrine de Sama Agent).
 * Présentation → appel à l'action → /auth (connexion/inscription réelles Supabase).
 * En harnais (auth non configurée) le CTA va droit à /app pour ne pas boucler
 * sur /auth→/. Dans tous les cas : le parcours lui-même vit sous `/app` (protégé).
 * Mobile-first : colonne 480px, boutons pleine largeur, pavés tactiles ≥ 44px.
 */
import Link from "next/link";
import { Button, GlassCard } from "@/components/ui";
import { ArrowRightIcon } from "@/components/icons";
import { useAuth } from "@/lib/auth/auth-context";

const STEPS = [
  {
    emoji: "🎤",
    title: "Décrivez",
    text: "Écrivez votre demande en français ou parlez en wolof : « je veux faire ma première demande de permis ».",
  },
  {
    emoji: "🧭",
    title: "Comprenez",
    text: "L'agent vous montre les pièces officielles exigées, avec la source légale qui les justifie.",
  },
  {
    emoji: "📁",
    title: "Agissez",
    text: "Un dossier personnel, suivi étape par étape jusqu'au dépôt — rien que pour vous.",
  },
];

const VALUES = [
  { emoji: "🗣️", label: "Réponses à l'oral, en wolof" },
  { emoji: "⚖️", label: "Sources officielles (référentiel CAPP)" },
  { emoji: "🔒", label: "Vos données restent privées" },
];

export default function LandingPage() {
  const { configured, loading, session } = useAuth();

  // CTA : espace connecté si déjà connecté / harnais ; sinon le vrai flux d'inscription.
  const startHref = !configured && !loading ? "/app" : session ? "/app" : "/auth";
  const startLabel = session ? "Ouvrir mon espace" : "Commencer";

  return (
    <section className="flex flex-col gap-10 pt-10 pb-6">
      {/* Hero */}
      <div className="text-center">
        <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3.5 py-1.5 text-xs font-semibold uppercase tracking-widest text-accent-ai">
          <span className="inline-block h-2 w-2 rounded-full bg-primary animate-pulse" />
          Assistant administratif vocal — Sénégal
        </p>
        <h1 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight">
          Décrivez votre démarche,{" "}
          <span className="text-gradient">Sama Agent</span> vous guide.
        </h1>
        <p className="mt-4 text-base text-text2">
          Parlez en wolof, lisez en français. Comprendre les démarches
          administratives et les suivre jusqu'au bout — sans simulation.
        </p>
        <div className="mt-7 flex flex-col gap-3">
          <Link href={startHref} className="w-full focus-visible">
            <Button variant="gradient" size="lg" className="w-full">
              {startLabel}
              <ArrowRightIcon className="h-5 w-5" />
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

      {/* Comment ça marche */}
      <div id="comment" className="flex scroll-mt-24 flex-col gap-3">
        <h2 className="text-center text-2xl font-extrabold tracking-tight">
          En <span className="text-gradient">3 étapes</span>
        </h2>
        {STEPS.map((s, i) => (
          <GlassCard key={s.title} className="flex items-start gap-4 p-5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-xl">
              {s.emoji}
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

      {/* Valeurs */}
      <div className="grid grid-cols-1 gap-3">
        {VALUES.map((v) => (
          <div
            key={v.label}
            className="flex items-center gap-3 rounded-card border border-white/10 bg-white/[0.04] px-4 py-3.5"
          >
            <span className="text-xl leading-none">{v.emoji}</span>
            <p className="text-sm font-semibold">{v.label}</p>
          </div>
        ))}
      </div>

      {/* Appel final */}
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
        <Link href="/limits" className="focus-visible text-sm text-text2 underline underline-offset-4">
          Ce que l'application peut et ne peut pas faire
        </Link>
      </GlassCard>
    </section>
  );
}