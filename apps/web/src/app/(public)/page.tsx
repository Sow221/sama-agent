"use client";

/**
 * Landing — `/`.
 *
 * Structure d'une landing qui convertit, dans l'ordre de lecture :
 *   1. Hero : ce que fait le produit, pour qui, UN appel à l'action principal ;
 *      périmètre annoncé honnêtement (une démarche disponible).
 *   2. Crédibilité : les technologies réellement branchées et la source officielle.
 *   3. Comment ça marche : les 4 étapes, les MÊMES que dans l'application.
 *   4. Ce que l'agent fait pour vous (bénéfices concrets).
 *   5. Transparence (IA responsable) : ce que l'agent ne fait pas.
 *   6. FAQ, puis appel à l'action final ; pied de page dans le layout.
 */
import Link from "next/link";
import { useAuth } from "@/lib/auth/auth-context";
import {
  ArrowRightIcon,
  BuildingIcon,
  CheckIcon,
  CompassIcon,
  InfoIcon,
  MemoryIcon,
  Mic,
  SearchIcon,
} from "@/components/icons";
import { VoiceCore } from "@/components/voice/VoiceCore";
import { isOnboardingDone } from "@/lib/auth/onboarding";

const STEPS = [
  { n: 1, title: "Comprendre", text: "Dites ce que vous voulez faire, en wolof ou en français. L'agent identifie la démarche qui vous correspond." },
  { n: 2, title: "Préparer", text: "Il liste les pièces officielles exigées, chacune avec sa source, et vous montre ce qui manque." },
  { n: 3, title: "Vérifier", text: "Déposez une photo de chaque pièce : l'agent vérifie qu'elle est lisible et qu'elle correspond à ce qui est demandé." },
  { n: 4, title: "Agir", text: "Dossier complet : vous savez où le déposer, avec le récapitulatif de vos pièces." },
];

const BENEFITS = [
  { Icon: Mic, title: "Parlez en wolof", text: "La voix est comprise en wolof et l'agent vous répond en wolof. Tout reste lisible en français à l'écran." },
  { Icon: BuildingIcon, title: "Des exigences sourcées", text: "Chaque pièce demandée renvoie à la source officielle qui la justifie." },
  { Icon: SearchIcon, title: "Vos pièces vérifiées avant le guichet", text: "Photo floue, document hors sujet : vous le savez avant de vous déplacer." },
  { Icon: MemoryIcon, title: "Un dossier qui vous suit", text: "Votre dossier est lié à votre compte : reprenez-le quand vous voulez, sur n'importe quel appareil." },
];

const LIMITS = [
  "Sama Agent n'est pas une administration : il vous prépare, le service compétent décide.",
  "Une pièce « analysée » n'est pas une pièce validée : la vérification officielle reste celle du service.",
  "Quand une information ne peut pas être confirmée, l'agent le dit au lieu de deviner.",
];

const FAQ = [
  {
    q: "Quelles démarches sont disponibles ?",
    a: "Pour l'instant, la première demande de permis de conduire, préparée à partir des informations du CAPP Karangë. D'autres démarches suivront.",
  },
  {
    q: "Faut-il parler wolof ?",
    a: "Non. Vous pouvez parler en wolof ou écrire en français. L'écran reste en français dans tous les cas.",
  },
  {
    q: "Sama Agent remplace-t-il le guichet ?",
    a: "Non. Il vous aide à arriver au guichet avec un dossier complet et lisible. La décision et la validation officielle restent celles du service compétent.",
  },
  {
    q: "Que deviennent mes informations ?",
    a: "Votre dossier et vos échanges sont liés à votre compte et ne sont visibles que par vous. Ce que l'agent retient de vous se consulte et s'efface depuis la page Mémoire.",
  },
];

export default function WelcomePage() {
  const { configured, loading, session } = useAuth();
  const inside = Boolean(session) || (!configured && !loading);
  const startHref = inside ? (session && !isOnboardingDone() ? "/onboarding" : "/app/home") : "/signup";
  const startLabel = inside ? "Ouvrir mon espace" : "Créer mon compte";

  return (
    <div className="flex flex-col">
      {/* 1. Hero */}
      <section className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 pb-16 pt-10 sm:px-6 md:grid-cols-[1.15fr_1fr] md:pb-24 md:pt-16">
        <div className="flex flex-col items-start gap-5">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-semibold uppercase tracking-widest text-accent-ai">
            <span className="inline-block h-2 w-2 rounded-full bg-primary" aria-hidden />
            Démarches administratives · Sénégal
          </p>
          <h1 className="text-4xl font-extrabold leading-[1.08] tracking-tight [text-wrap:balance] sm:text-5xl lg:text-6xl">
            Préparez votre dossier administratif{" "}
            <span className="text-gradient">en parlant wolof.</span>
          </h1>
          <p className="max-w-xl text-lg text-text2">
            Dites ce que vous voulez faire. Sama Agent identifie la démarche, liste les pièces
            officielles exigées, vérifie vos documents et vous indique la prochaine étape.
          </p>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Link
              href={startHref}
              className="focus-visible inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-primary to-accent-ai px-7 text-base font-semibold text-[#04211a] shadow-glow transition-transform active:scale-[0.98]"
            >
              {startLabel}
              <ArrowRightIcon className="h-5 w-5" />
            </Link>
            <a
              href="#comment"
              className="focus-visible inline-flex min-h-12 items-center justify-center rounded-full border border-border-strong px-7 text-base font-semibold text-text1 hover:bg-surface-hover"
            >
              Comment ça marche
            </a>
          </div>
          <p className="flex items-center gap-2 text-sm text-text-muted">
            <InfoIcon className="h-4 w-4 shrink-0" />
            Démarche disponible : première demande de permis de conduire.
          </p>
        </div>

        <div className="relative mx-auto flex w-full max-w-md flex-col items-center gap-6 rounded-[28px] border border-white/10 bg-white/[0.04] px-6 py-10 shadow-elevated">
          <VoiceCore state="idle" size="lg" interactive={false} ariaLabel="Sama Agent" focusable={false} />
          <div className="w-full space-y-3 text-sm">
            <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-3 text-[#04211a]">
              « Bëgg naa def sama permis de conduire. »
            </p>
            <p className="mr-auto max-w-[90%] rounded-2xl rounded-bl-md border border-border bg-surface px-4 py-3 text-text1">
              Première demande de permis : il faut une pièce d'identité, un certificat médical et
              des photographies.
            </p>
          </div>
          <p className="text-center text-xs text-text-muted">
            Exemple de demande et de réponse pour cette démarche.
          </p>
        </div>
      </section>

      {/* 2. Crédibilité */}
      <section aria-labelledby="techno" className="border-y border-border bg-white/[0.02]">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 sm:px-6 md:flex-row md:items-center md:justify-between">
          <h2 id="techno" className="text-xs font-semibold uppercase tracking-widest text-text-muted">
            Construit avec
          </h2>
          <ul className="flex flex-wrap gap-x-8 gap-y-2 text-sm font-semibold text-text2">
            <li>NVIDIA — compréhension et vision</li>
            <li>Kiriku — wolof (IA Hub Sénégal)</li>
            <li>Adia — voix wolof (Concree)</li>
            <li>CAPP Karangë — source officielle</li>
          </ul>
        </div>
      </section>

      {/* 3. Comment ça marche */}
      <section id="comment" className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6 md:py-24">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">Comment ça marche</p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight [text-wrap:balance] sm:text-4xl">
            De votre demande au dépôt du dossier, en 4 étapes
          </h2>
        </div>
        <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <li key={s.n} className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-full border border-primary/40 font-bold text-primary">
                {s.n}
              </span>
              <h3 className="text-lg font-bold">{s.title}</h3>
              <p className="text-sm text-text2">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* 4. Bénéfices */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6 md:pb-24">
        <h2 className="text-3xl font-extrabold tracking-tight [text-wrap:balance] sm:text-4xl">
          Ce que Sama Agent fait pour vous
        </h2>
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {BENEFITS.map((b) => (
            <div key={b.title} className="flex gap-4 rounded-card border border-border bg-surface p-6">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent-ai">
                <b.Icon className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-lg font-bold">{b.title}</h3>
                <p className="mt-1 text-text2">{b.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 5. Transparence */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6 md:pb-24">
        <div className="grid gap-8 rounded-[28px] border border-warning/30 bg-warning/[0.06] p-6 sm:p-10 md:grid-cols-[1fr_1.4fr]">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-warning">Transparence</p>
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">
              Un assistant honnête sur ses limites
            </h2>
            <Link href="/limits" className="focus-visible mt-4 inline-flex items-center gap-1 text-sm font-semibold text-accent-ai">
              Lire toutes les limites <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </div>
          <ul className="flex flex-col gap-3">
            {LIMITS.map((l) => (
              <li key={l} className="flex gap-3 text-text1">
                <CheckIcon className="mt-1 h-4 w-4 shrink-0 text-warning" />
                <span>{l}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 6. FAQ */}
      <section id="faq" className="mx-auto w-full max-w-3xl scroll-mt-20 px-4 pb-16 sm:px-6 md:pb-24">
        <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Questions fréquentes</h2>
        <div className="mt-8 flex flex-col gap-3">
          {FAQ.map((f) => (
            <details key={f.q} className="group rounded-card border border-border bg-surface p-5 open:bg-white/[0.07]">
              <summary className="focus-visible flex cursor-pointer list-none items-center justify-between gap-4 rounded-md font-semibold">
                {f.q}
                <span aria-hidden className="text-xl text-text2 transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-text2">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* 7. Appel final */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6">
        <div className="flex flex-col items-center gap-5 rounded-[28px] border border-white/10 bg-gradient-to-br from-primary/[0.14] via-white/[0.04] to-accent-ai/[0.14] px-6 py-12 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.08] text-primary">
            <CompassIcon className="h-6 w-6" />
          </span>
          <h2 className="max-w-xl text-3xl font-extrabold tracking-tight [text-wrap:balance]">
            Arrivez au guichet avec un dossier complet
          </h2>
          <p className="max-w-md text-text2">
            Créez votre compte, décrivez votre démarche : l'agent s'occupe de la suite avec vous.
          </p>
          <Link
            href={startHref}
            className="focus-visible inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-primary to-accent-ai px-7 text-base font-semibold text-[#04211a] shadow-glow"
          >
            {startLabel}
            <ArrowRightIcon className="h-5 w-5" />
          </Link>
          {!inside ? (
            <p className="text-sm text-text2">
              Déjà inscrit ?{" "}
              <Link href="/login" className="focus-visible font-semibold text-primary">
                Se connecter
              </Link>
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
