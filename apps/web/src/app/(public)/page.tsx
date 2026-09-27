"use client";

/**
 * Landing — `/`.
 *
 * Hiérarchie d'une landing qui convertit, dans l'ordre de lecture :
 *   1. Hero : promesse, pour qui, UN appel principal, visuel RÉEL du produit.
 *   2. Crédibilité : les technologies réellement branchées + la source officielle.
 *   3. Problème → réponse : pourquoi préparer son dossier est pénible aujourd'hui.
 *   4. Comment ça marche : les 4 étapes, les MÊMES que dans l'application.
 *   5. Fonctionnalités en détail, chacune illustrée par une capture de l'app.
 *   6. Nos engagements (confiance), 7. FAQ, 8. Appel final. Pied de page : layout.
 *
 * Les captures (`/public/landing`) sont de vraies captures de l'application, prises
 * sur le parcours réel « première demande de permis de conduire ».
 * Aucune promesse qui ne soit pas livrée : une seule démarche est disponible.
 */
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/lib/auth/auth-context";
import { isOnboardingDone } from "@/lib/auth/onboarding";
import { COMMITMENTS, STEPS } from "@/lib/content/help";
import { FaqList } from "@/components/help/HelpContent";
import { ArrowRightIcon, BuildingIcon, CheckIcon, Mic, SearchIcon } from "@/components/icons";

const PROBLEMS = [
  {
    Icon: BuildingIcon,
    pain: "Des informations dispersées",
    answer: "La liste officielle des pièces, au même endroit, chacune avec sa source.",
  },
  {
    Icon: Mic,
    pain: "Un langage administratif difficile",
    answer: "Vous expliquez votre besoin en wolof, avec vos mots. L'agent en fait une démarche claire.",
  },
  {
    Icon: SearchIcon,
    pain: "La mauvaise surprise au guichet",
    answer: "Pièce manquante ou photo illisible : vous le savez avant de vous déplacer.",
  },
];

const FEATURES = [
  {
    step: "Étape 1 · Comprendre",
    title: "Dites-le comme vous le diriez à un proche",
    text: "Parlez en wolof ou écrivez en français. L'agent reconnaît votre démarche et vous montre ce qu'il a compris, avant d'aller plus loin.",
    points: [
      "Voix en wolof, réponse orale en wolof",
      "Ce qui a été compris est affiché, jamais deviné en silence",
      "Si votre demande est ambiguë, l'agent vous pose la question",
    ],
    image: "/landing/comprendre.webp",
    alt: "Écran « Votre demande » : la phrase « Bëgg naa def sama permis de conduire » est reconnue comme une première demande de permis, avec les trois pièces officielles exigées.",
  },
  {
    step: "Étape 2 · Préparer",
    title: "Votre parcours, clair à chaque instant",
    text: "Où en êtes-vous ? Qu'est-ce qui manque ? Quelle est la prochaine action ? Tout est calculé à partir de votre dossier et mis à jour à chaque pièce déposée.",
    points: [
      "Les 4 étapes de votre démarche en un coup d'œil",
      "Ce qui manque, nommé précisément",
      "Une seule prochaine action, toujours",
    ],
    image: "/landing/parcours.webp",
    alt: "Écran « Votre parcours » : étape Préparer en cours, 0 sur 3 éléments fournis, liste de ce qui manque et prochaine action « Fournir un document ».",
  },
  {
    step: "Étape 3 · Vérifier",
    title: "Vos pièces contrôlées avant le guichet",
    text: "Photographiez chaque document. L'agent vérifie qu'il est lisible et qu'il correspond à la pièce demandée, et vous dit franchement quand un contrôle humain reste nécessaire.",
    points: [
      "Analyse de l'image par la vision NVIDIA",
      "Un statut clair pour chaque pièce du dossier",
      "Jamais « validé » à la place du service compétent",
    ],
    image: "/landing/dossier.webp",
    alt: "Écran « Mon dossier » : la pièce d'identité est « à vérifier par le service », le certificat médical et les photographies sont « à fournir ».",
  },
];

const TECH = [
  { name: "NVIDIA", role: "Compréhension et vision" },
  { name: "Kiriku", role: "Reconnaissance du wolof" },
  { name: "Adia", role: "Voix wolof" },
  { name: "CAPP Karangë", role: "Source officielle" },
];

/** Cadre de téléphone autour d'une vraie capture de l'application. */
function PhoneShot({ src, alt, preload = false }: { src: string; alt: string; preload?: boolean }) {
  return (
    <div className="relative mx-auto w-full max-w-[300px]">
      <div
        aria-hidden
        className="absolute -inset-8 -z-10 rounded-full bg-gradient-to-br from-primary/25 via-transparent to-accent-ai/25 blur-3xl"
      />
      <div className="overflow-hidden rounded-[2.2rem] border-[6px] border-[#1c2a3f] bg-bg shadow-elevated ring-1 ring-white/10">
        <Image
          src={src}
          alt={alt}
          width={780}
          height={1688}
          sizes="(min-width: 768px) 300px, 80vw"
          preload={preload}
          className="h-auto w-full"
        />
      </div>
    </div>
  );
}

export default function WelcomePage() {
  const { configured, loading, session } = useAuth();
  const inside = Boolean(session) || (!configured && !loading);
  const startHref = inside ? (session && !isOnboardingDone() ? "/onboarding" : "/app/home") : "/signup";
  const startLabel = inside ? "Ouvrir mon espace" : "Créer mon compte";

  const primaryCta = (
    <Link
      href={startHref}
      className="focus-visible inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-primary to-accent-ai px-7 text-base font-semibold text-[#04211a] shadow-glow transition-transform active:scale-[0.98]"
    >
      {startLabel}
      <ArrowRightIcon className="h-5 w-5" />
    </Link>
  );

  return (
    <div className="flex flex-col overflow-x-clip">
      {/* 1. Hero */}
      <section className="relative isolate overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] bg-[radial-gradient(ellipse_at_top,rgb(var(--primary-rgb)/0.16),transparent_60%)]"
        />
        <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 pb-16 pt-10 sm:px-6 md:grid-cols-[1.2fr_1fr] md:pb-24 md:pt-16">
          <div className="flex flex-col items-start gap-6">
            <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-semibold uppercase tracking-widest text-accent-ai">
              <span className="inline-block h-2 w-2 rounded-full bg-primary" aria-hidden />
              Assistant administratif vocal · Sénégal
            </p>
            <h1 className="text-4xl font-extrabold leading-[1.08] tracking-tight [text-wrap:balance] sm:text-5xl lg:text-6xl">
              Votre dossier administratif, préparé <span className="text-gradient">en parlant wolof.</span>
            </h1>
            <p className="max-w-xl text-lg text-text2">
              Dites ce que vous voulez faire. Sama Agent identifie la démarche, liste les pièces
              officielles exigées, contrôle vos documents et vous guide jusqu'au dépôt.
            </p>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              {primaryCta}
              <a
                href="#comment"
                className="focus-visible inline-flex min-h-12 items-center justify-center rounded-full border border-border-strong px-7 text-base font-semibold text-text1 hover:bg-surface-hover"
              >
                Voir comment ça marche
              </a>
            </div>
            <ul className="flex flex-col gap-2 text-sm text-text2 sm:flex-row sm:flex-wrap sm:gap-x-6">
              {["Wolof ou français", "Sources officielles", "Sans installation"].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <CheckIcon className="h-4 w-4 shrink-0 text-primary" />
                  {t}
                </li>
              ))}
            </ul>
            <p className="text-sm text-text-muted">
              Démarche disponible : première demande de permis de conduire.
            </p>
          </div>

          <div className="relative">
            <PhoneShot src={FEATURES[1].image} alt={FEATURES[1].alt} preload />
            <div className="absolute -left-2 bottom-10 hidden max-w-[240px] rounded-2xl border border-white/10 bg-surface-elevated p-4 shadow-elevated backdrop-blur sm:block md:-left-10">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-accent-ai">
                <Mic className="h-4 w-4" /> Vous dites
              </p>
              <p className="mt-1 font-semibold" lang="wo">
                « Bëgg naa def sama permis de conduire. »
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Crédibilité */}
      <section aria-labelledby="techno" className="border-y border-border bg-white/[0.02]">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-8 sm:px-6 md:flex-row md:items-center md:justify-between">
          <h2 id="techno" className="text-xs font-semibold uppercase tracking-widest text-text-muted">
            Propulsé par
          </h2>
          <ul className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4 md:gap-x-12">
            {TECH.map((t) => (
              <li key={t.name} className="flex flex-col">
                <span className="text-base font-bold text-text1">{t.name}</span>
                <span className="text-xs text-text-muted">{t.role}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 3. Problème → réponse */}
      <section aria-labelledby="probleme" className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 md:py-24">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">Pourquoi Sama Agent</p>
          <h2 id="probleme" className="mt-2 text-3xl font-extrabold tracking-tight [text-wrap:balance] sm:text-4xl">
            Préparer un dossier ne devrait pas demander plusieurs allers-retours
          </h2>
        </div>
        <ul className="mt-10 grid gap-4 md:grid-cols-3">
          {PROBLEMS.map((p) => (
            <li key={p.pain} className="flex flex-col gap-4 rounded-card border border-border bg-surface p-6">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-soft text-accent-ai">
                <p.Icon className="h-5 w-5" />
              </span>
              <h3 className="text-lg font-bold">{p.pain}</h3>
              <p className="flex gap-2 text-text2">
                <ArrowRightIcon className="mt-1 h-4 w-4 shrink-0 text-primary" />
                <span>{p.answer}</span>
              </p>
            </li>
          ))}
        </ul>
      </section>

      {/* 4. Comment ça marche */}
      <section id="comment" aria-labelledby="comment-titre" className="scroll-mt-20 border-y border-border bg-white/[0.02]">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 md:py-24">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-widest text-primary">Comment ça marche</p>
            <h2 id="comment-titre" className="mt-2 text-3xl font-extrabold tracking-tight [text-wrap:balance] sm:text-4xl">
              De votre demande au dépôt du dossier, en 4 étapes
            </h2>
          </div>
          <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <li key={s.n} className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent-ai font-bold text-[#04211a]">
                  {s.n}
                </span>
                <h3 className="text-lg font-bold">{s.title}</h3>
                <p className="text-sm text-text2">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 5. Fonctionnalités, illustrées par l'application réelle */}
      <section
        id="fonctionnalites"
        aria-labelledby="fonctionnalites-titre"
        className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6 md:py-24"
      >
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">Fonctionnalités</p>
          <h2 id="fonctionnalites-titre" className="mt-2 text-3xl font-extrabold tracking-tight [text-wrap:balance] sm:text-4xl">
            Ce que vous voyez dans l'application
          </h2>
        </div>
        <div className="mt-14 flex flex-col gap-20 md:gap-28">
          {FEATURES.map((f, i) => (
            <article key={f.title} className="grid items-center gap-10 md:grid-cols-2 md:gap-16">
              <div className={i % 2 === 1 ? "md:order-2" : ""}>
                <p className="text-sm font-semibold uppercase tracking-widest text-accent-ai">{f.step}</p>
                <h3 className="mt-2 text-2xl font-extrabold tracking-tight [text-wrap:balance] sm:text-3xl">{f.title}</h3>
                <p className="mt-4 text-lg text-text2">{f.text}</p>
                <ul className="mt-6 flex flex-col gap-3">
                  {f.points.map((pt) => (
                    <li key={pt} className="flex gap-3">
                      <CheckIcon className="mt-1 h-4 w-4 shrink-0 text-primary" />
                      <span>{pt}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className={i % 2 === 1 ? "md:order-1" : ""}>
                <PhoneShot src={f.image} alt={f.alt} />
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* 6. Nos engagements */}
      <section id="engagements" aria-labelledby="engagements-titre" className="scroll-mt-20 border-y border-border bg-white/[0.02]">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-16 sm:px-6 md:grid-cols-[1fr_1.6fr] md:py-24">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-primary">Nos engagements</p>
            <h2 id="engagements-titre" className="mt-2 text-3xl font-extrabold tracking-tight [text-wrap:balance] sm:text-4xl">
              Une IA digne de confiance pour vos démarches
            </h2>
            <p className="mt-4 text-text2">
              Une démarche administrative n'autorise pas l'approximation. Sama Agent est conçu pour
              être exact, sourcé et transparent.
            </p>
            <Link href="/aide" className="focus-visible mt-6 inline-flex items-center gap-1 font-semibold text-accent-ai">
              Consulter l'aide <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2">
            {COMMITMENTS.map((c) => (
              <li key={c.title} className="flex flex-col gap-2 rounded-card border border-border bg-surface p-5">
                <CheckIcon className="h-5 w-5 text-primary" />
                <h3 className="font-bold">{c.title}</h3>
                <p className="text-sm text-text2">{c.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 7. FAQ */}
      <section id="faq" aria-labelledby="faq-titre" className="mx-auto w-full max-w-3xl scroll-mt-20 px-4 py-16 sm:px-6 md:py-24">
        <h2 id="faq-titre" className="text-center text-3xl font-extrabold tracking-tight sm:text-4xl">
          Questions fréquentes
        </h2>
        <FaqList className="mt-10" />
      </section>

      {/* 8. Appel final */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6">
        <div className="flex flex-col items-center gap-5 rounded-[28px] border border-white/10 bg-gradient-to-br from-primary/[0.14] via-white/[0.04] to-accent-ai/[0.14] px-6 py-14 text-center">
          <h2 className="max-w-xl text-3xl font-extrabold tracking-tight [text-wrap:balance] sm:text-4xl">
            Arrivez au guichet avec un dossier complet
          </h2>
          <p className="max-w-md text-text2">
            Créez votre compte, dites ce que vous voulez faire : l'agent prépare la suite avec vous.
          </p>
          {primaryCta}
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
