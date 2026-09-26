"use client";

/**
 * Sections « Moi » — `/app/you/[section]` (spec §20, §67-68).
 * Compte · Agent · Voix · Préférences · Confidentialité · Aide.
 * Préférences = choix locaux réels (lib/prefs) ; données de compte = session réelle.
 */
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Avatar, Badge, Button, Card, EmptyState } from "@/components/ui";
import { useAuth } from "@/lib/auth/auth-context";
import { resetOnboarding } from "@/lib/auth/onboarding";
import { useBoolPref, useEnumPref } from "@/lib/prefs";

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className="focus-visible flex w-full items-center justify-between gap-4 rounded-lg px-2 py-3 text-left"
    >
      <span>
        <span className="block font-semibold">{label}</span>
        {description ? <span className="mt-0.5 block text-sm text-text2">{description}</span> : null}
      </span>
      <span
        aria-hidden
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-ui ${
          checked ? "bg-primary" : "bg-surface-2"
        }`}
      >
        <span
          className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all duration-modal ${
            checked ? "left-[calc(100%-1.625rem)]" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}

export default function YouSectionPage() {
  const { section } = useParams<{ section: string }>();
  const router = useRouter();
  const { user, configured } = useAuth();

  const [autoSpeak, toggleAutoSpeak] = useBoolPref("voice.autoSpeak", true);
  const [sounds, toggleSounds] = useBoolPref("voice.sounds", true);
  const [style, setStyle] = useEnumPref<"concise" | "detailed">("agent.style", "concise");
  const [langue, setLangue] = useEnumPref<"fr" | "wo">("prefs.langue", "fr");

  const name = (user?.user_metadata?.name as string | undefined) ?? null;

  switch (section) {
    case "account":
      return (
        <div className="flex max-w-xl flex-col gap-6">
          <h1 className="text-3xl font-extrabold tracking-tight">Compte</h1>
          <Card className="flex items-center gap-4">
            <Avatar name={name ?? user?.email} size="lg" />
            <div className="min-w-0">
              <p className="truncate font-bold">{name ?? "Compte connecté"}</p>
              <p className="truncate text-sm text-text2">{user?.email ?? "—"}</p>
            </div>
          </Card>
          <Card className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-text-muted">Session</p>
            <p className="text-sm text-text2">
              {configured
                ? "Identité vérifiée via Supabase Auth. Chaque appel du worker est authentifié avec votre jeton."
                : "Mode de démonstration (auth non configurée) : l'identité de service du worker s'applique."}
            </p>
          </Card>
          <Button variant="secondary" onClick={() => resetOnboarding()}>
            Revoir l'onboarding
          </Button>
        </div>
      );

    case "agent":
      return (
        <div className="flex max-w-xl flex-col gap-6">
          <h1 className="text-3xl font-extrabold tracking-tight">Agent</h1>
          <Card className="flex flex-col gap-1 p-2">
            <p className="px-2 pt-2 text-sm font-semibold text-text-muted">Style de réponse</p>
            {(
              [
                { id: "concise", label: "Concis", description: "Réponses courtes, à l'essentiel." },
                { id: "detailed", label: "Détaillé", description: "Explications complètes avec sources." },
              ] as const
            ).map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setStyle(o.id)}
                className={`focus-visible flex items-start gap-3 rounded-lg px-2 py-3 text-left ${
                  style === o.id ? "bg-surface-hover" : ""
                }`}
              >
                <span
                  aria-hidden
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                    style === o.id ? "border-primary" : "border-text-muted"
                  }`}
                >
                  {style === o.id ? <span className="h-2.5 w-2.5 rounded-full bg-primary" /> : null}
                </span>
                <span>
                  <span className="block font-semibold">{o.label}</span>
                  <span className="block text-sm text-text2">{o.description}</span>
                </span>
              </button>
            ))}
          </Card>
          <p className="text-xs text-text-muted">
            Préférence locale uniquement (réponses réelles du worker inchangées).
          </p>
        </div>
      );

    case "voice":
      return (
        <div className="flex max-w-xl flex-col gap-6">
          <h1 className="text-3xl font-extrabold tracking-tight">Voix</h1>
          <Card className="flex flex-col p-2">
            <Toggle
              label="Réponses orales"
              description="L'agent vous répond à la voix pendant les sessions vocales."
              checked={autoSpeak}
              onChange={toggleAutoSpeak}
            />
            <span className="mx-2 block h-px bg-border" />
            <Toggle
              label="Sons d'interface"
              description="Retour sonore lors des transitions de la session vocale."
              checked={sounds}
              onChange={toggleSounds}
            />
          </Card>
          <Card className="flex items-start gap-3">
            <span aria-hidden className="text-xl">🎙️</span>
            <p className="text-sm text-text2">
              La session vocale utilise votre micro (VAD Silero), LiveKit pour le transport et le
              worker pour la reconnaissance (Kiriku) et la synthèse (xTTS wolof).
            </p>
          </Card>
        </div>
      );

    case "preferences":
      return (
        <div className="flex max-w-xl flex-col gap-6">
          <h1 className="text-3xl font-extrabold tracking-tight">Préférences</h1>
          <Card className="flex flex-col gap-1 p-2">
            <p className="px-2 pt-2 text-sm font-semibold text-text-muted">Langue</p>
            {(
              [
                { id: "fr", label: "Français", description: "Interface et réponses écrites." },
                { id: "wo", label: "Wolof (voix)", description: "Parler en wolof ; l'écrit reste en français." },
              ] as const
            ).map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setLangue(o.id)}
                className={`focus-visible flex items-start gap-3 rounded-lg px-2 py-3 text-left ${
                  langue === o.id ? "bg-surface-hover" : ""
                }`}
              >
                <span
                  aria-hidden
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                    langue === o.id ? "border-primary" : "border-text-muted"
                  }`}
                >
                  {langue === o.id ? <span className="h-2.5 w-2.5 rounded-full bg-primary" /> : null}
                </span>
                <span>
                  <span className="block font-semibold">{o.label}</span>
                  <span className="block text-sm text-text2">{o.description}</span>
                </span>
              </button>
            ))}
          </Card>
          <p className="text-xs text-text-muted">
            Préférences locales — réinitialisables à tout moment dans votre navigateur.
          </p>
        </div>
      );

    case "privacy":
      return (
        <div className="flex max-w-xl flex-col gap-6">
          <h1 className="text-3xl font-extrabold tracking-tight">Confidentialité</h1>
          {[
            "Vos pièces et votre dossier ne sont partagés avec personne hors de la chaîne de traitement.",
            "L'identité Supabase authentifie chaque appel : le worker n'agit jamais « anonymement » en production.",
            "La mémoire est limitée à ce que vous fournissez volontairement (demande, pièces, préférences).",
            "Une pièce « ANALYSÉE » n'est pas une validation officielle — vérification par le service compétent requise.",
          ].map((line, i) => (
            <Card key={i} className="flex items-start gap-3">
              <Badge tone="info">{i + 1}</Badge>
              <p className="text-sm text-text1">{line}</p>
            </Card>
          ))}
          <Link href="/limits" className="focus-visible">
            <Button variant="secondary" className="w-full">
              Voir les limites de l'application
            </Button>
          </Link>
        </div>
      );

    case "help":
      return (
        <div className="flex max-w-xl flex-col gap-6">
          <h1 className="text-3xl font-extrabold tracking-tight">Aide</h1>
          <Link href="/app/comprehension" className="focus-visible">
            <Card className="transition-colors hover:border-primary/40">
              <p className="font-semibold">Comprendre une démarche</p>
              <p className="mt-0.5 text-sm text-text2">Les pièces exigées et leurs sources officielles.</p>
            </Card>
          </Link>
          <Link href="/limits" className="focus-visible">
            <Card className="transition-colors hover:border-primary/40">
              <p className="font-semibold">Limites de l'application</p>
              <p className="mt-0.5 text-sm text-text2">Transparence sur ce que Sama Agent peut et ne peut pas faire.</p>
            </Card>
          </Link>
        </div>
      );

    default:
      return (
        <EmptyState
          emoji="🧭"
          title="Section introuvable"
          description={`« ${section} » n'est pas une section du profil.`}
          action={
            <Button variant="gradient" onClick={() => router.push("/app/you")}>
              Retour au profil
            </Button>
          }
        />
      );
  }
}