"use client";

/**
 * Onboarding — `/onboarding` (UI/UX Master Spec §23-27).
 * Court, orienté expérience : intro → voix → permission micro RÉELLE →
 * mémoire → première conversation. Alternative texte partout (jamais bloquant).
 * Flag local `sama:onboarding` ; les données de la session viennent d'ailleurs (réelles).
 */
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, GlassCard } from "@/components/ui";
import { VoiceCore } from "@/components/voice/VoiceCore";
import { CompassIcon, MemoryIcon, Mic } from "@/components/icons";
import { useAuth } from "@/lib/auth/auth-context";
import { completeOnboarding, isOnboardingDone } from "@/lib/auth/onboarding";
import { takeNext } from "@/lib/auth/next";

const STEPS = ["Intro", "Voix", "Micro", "Mémoire", "C'est parti"];

/** Les sous-routes Cahier §2 (`/onboarding/voice|permissions|memory|first-conversation`)
 *  arrivent via `?step=` et sautent à l'étape correspondante du wizard unique. */
const STEP_FROM_PARAM: Record<string, number> = {
  voice: 1,
  permissions: 2,
  memory: 3,
  "first-conversation": 4,
};

export default function OnboardingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const stepParam = searchParams.get("step");
  const { configured, loading, session } = useAuth();
  const [step, setStep] = useState(0);
  const [mic, setMic] = useState<"untested" | "granted" | "denied" | "testing">("untested");
  const mediaRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const target = STEP_FROM_PARAM[stepParam ?? ""];
    if (target != null && target !== step) setStep(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepParam]);

  useEffect(() => {
    if (!configured && !loading) router.replace(takeNext());
    else if (configured && !loading && !session) router.replace("/login");
    else if (!loading && session && isOnboardingDone()) router.replace(takeNext());
  }, [configured, loading, session, router]);

  const finish = () => {
    completeOnboarding();
    router.replace(takeNext());
  };

  async function requestMic() {
    setMic("testing");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRef.current = stream;
      setMic("granted");
    } catch {
      setMic("denied");
    }
  }

  useEffect(() => {
    return () => {
      mediaRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  if (loading) return null;

  const next = () => (step < STEPS.length - 1 ? setStep(step + 1) : finish());
  const back = () => (step > 0 ? setStep(step - 1) : router.back());

  return (
    <section className="mx-auto flex min-h-[calc(100dvh-4.5rem)] max-w-md flex-col justify-center gap-6 py-10">
      {/* progression */}
      <div className="flex items-center gap-2" aria-label={`Étape ${step + 1} sur ${STEPS.length}`}>
        {STEPS.map((label, i) => (
          <span
            key={label}
            className={`h-1.5 flex-1 rounded-full transition-colors duration-ui ${
              i <= step ? "bg-primary" : "bg-surface-2"
            }`}
            title={label}
          />
        ))}
      </div>

      {step === 0 ? (
        <GlassCard className="flex flex-col items-center gap-4 p-8 text-center">
          <span aria-hidden className="flex h-16 w-16 items-center justify-center rounded-3xl bg-surface text-accent-ai">
            <CompassIcon className="h-9 w-9" />
          </span>
          <h1 className="text-2xl font-extrabold tracking-tight">
            Rencontrez {""}
            <span className="text-gradient">Sama Agent</span>
          </h1>
          <p className="text-base text-text2">
            Parlez-lui naturellement, en wolof. Il comprend vos démarches administratives, vous montre
            les pièces exigées et suit votre dossier jusqu'au bout.
          </p>
        </GlassCard>
      ) : null}

      {step === 1 ? (
        <GlassCard className="flex flex-col items-center gap-4 p-8 text-center">
          <VoiceCore state="listening" size="md" interactive={false} />
          <h1 className="text-2xl font-extrabold tracking-tight">Testons votre voix</h1>
          <p className="text-base text-text2">
            Depuis l'écran Voix, parlez en wolof comme à un conseiller : l'agent écoute réellement
            votre voix, puis vous répond et met votre dossier à jour.
          </p>
        </GlassCard>
      ) : null}

      {step === 2 ? (
        <GlassCard className="flex flex-col items-center gap-4 p-8 text-center">
          <span aria-hidden className="flex h-16 w-16 items-center justify-center rounded-3xl bg-surface text-accent-ai">
            <Mic className="h-9 w-9" />
          </span>
          <h1 className="text-2xl font-extrabold tracking-tight">Permission micro</h1>
          <p className="text-base text-text2">
            La permission système permet à l'agent de vous entendre. Vous pourrez la changer à tout
            moment dans les paramètres du navigateur.
          </p>
          {mic === "granted" ? (
            <p role="status" className="rounded-full border border-success/30 bg-success/10 px-4 py-2 text-sm font-semibold text-success">
              ✓ Accès accordé
            </p>
          ) : mic === "denied" ? (
            <p role="status" className="rounded-full border border-warning/30 bg-warning/10 px-4 py-2 text-sm font-semibold text-warning">
              Micro refusé — vous pouvez continuer en texte.
            </p>
          ) : null}
          <Button
            type="button"
            variant="gradient"
            size="lg"
            className="w-full"
            loading={mic === "testing"}
            onClick={requestMic}
          >
            Autoriser le micro
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() => setMic("denied")}
          >
            Continuer avec le texte
          </Button>
        </GlassCard>
      ) : null}

      {step === 3 ? (
        <GlassCard className="flex flex-col items-center gap-4 p-8 text-center">
          <span aria-hidden className="flex h-16 w-16 items-center justify-center rounded-3xl bg-surface text-accent-ai">
            <MemoryIcon className="h-9 w-9" />
          </span>
          <h1 className="text-2xl font-extrabold tracking-tight">Une mémoire, sous contrôle</h1>
          <p className="text-base text-text2">
            Sama se souvient de ce que vous choisissez de garder : votre demande, vos pièces, vos
            préférences. Vous restez maître des données conservées.
          </p>
        </GlassCard>
      ) : null}

      {step === 4 ? (
        <GlassCard className="flex flex-col items-center gap-4 p-8 text-center">
          <VoiceCore state="idle" size="md" interactive={false} />
          <h1 className="text-2xl font-extrabold tracking-tight">Sur quoi travaillons-nous ?</h1>
          <p className="text-base text-text2">
            Décrivez votre démarche à l'oral ou à l'écrit. L'agent construit votre parcours et votre
            dossier en temps réel.
          </p>
        </GlassCard>
      ) : null}

      {/* actions */}
      <div className="flex items-center justify-between gap-3">
        {step === 0 ? (
          <span />
        ) : (
          <Button type="button" variant="ghost" onClick={back}>
            Retour
          </Button>
        )}
        <Button type="button" variant="gradient" size="lg" onClick={next}>
          {step === STEPS.length - 1 ? "C'est parti" : "Continuer"}
        </Button>
      </div>
      <p className="text-center text-xs text-text-muted">
        Étape {step + 1} / {STEPS.length} — {STEPS[step]}
      </p>
    </section>
  );
}