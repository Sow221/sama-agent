/**
 * Voice Core — UI/UX Master Spec §13-14, §125.
 * Un seul composant, aucun « Core » différent selon l'écran (§40).
 *
 * États (§14) : idle · hover · pressed · listening · processing · speaking ·
 * interrupted · error · offline.
 * - Anneaux pilotés par le VOLUME RÉEL (événement `sama:analyser`, phases
 *   listening/speaking) — sinon pulsation d'état (jamais décorative, §87).
 * - $\top transcript affiché quand une transcription RÉELLE est disponible.
 * - Sizes : sm 96 · md 128 · lg 160 · xl 208 (§13).
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { Mic } from "@/components/icons";
import { cn } from "@/lib/cn";

export type CoreState =
  | "idle"
  | "listening"
  | "transcribing"
  | "processing"
  | "speaking"
  | "acting"
  | "waiting_confirmation"
  | "success"
  | "paused"
  | "interrupted"
  | "error"
  | "offline"
  | "connecting";

export const CORE_SIZES = {
  sm: 96,
  md: 128,
  lg: 160,
  xl: 208,
} as const;

/**
 * Labels (§5 Cahier : « Got you. », « En pause », « Je travaille dessus… »,
 * « Avant de faire ça… », « C'est fait. »). Les états étendus (transcribing /
 * paused / acting / waiting_confirmation / success) sont produits par le
 * backend réel ou les store ; jamais inventés côté interface (§95).
 */
export const CORE_STATE_LABEL: Record<CoreState, string> = {
  idle: "",
  listening: "J'écoute…",
  transcribing: "C'est noté…",
  processing: "J'analyse…",
  speaking: "Je réponds…",
  acting: "Je travaille dessus…",
  waiting_confirmation: "Avant de faire ça…",
  success: "C'est fait.",
  paused: "En pause",
  interrupted: "Interrompu",
  error: "Problème rencontré",
  offline: "Hors ligne",
  connecting: "Connexion…",
};

const RING_COLORS: Record<CoreState, string> = {
  idle: "rgba(56,189,248,0.35)",
  listening: "rgba(56,189,248,0.65)",
  transcribing: "rgba(56,189,248,0.55)",
  processing: "rgba(13,201,138,0.5)",
  speaking: "rgba(13,201,138,0.7)",
  acting: "rgba(13,201,138,0.65)",
  waiting_confirmation: "rgba(245,165,36,0.6)",
  success: "rgba(13,201,138,0.8)",
  paused: "rgba(248,250,252,0.35)",
  interrupted: "rgba(245,165,36,0.6)",
  error: "rgba(239,68,68,0.6)",
  offline: "rgba(248,250,252,0.25)",
  connecting: "rgba(56,189,248,0.4)",
};

export function VoiceCore({
  state = "idle",
  size = "lg",
  interactive = true,
  showTranscript = false,
  transcript,
  onPress,
  ariaLabel = "Parler à Sama Agent",
  className = "",
}: {
  state?: CoreState;
  size?: keyof typeof CORE_SIZES;
  interactive?: boolean;
  showTranscript?: boolean;
  transcript?: string;
  onPress?: () => void;
  ariaLabel?: string;
  className?: string;
}) {
  const analyserRef = useRef<AnalyserNode | null>(null);
  const ringsRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const [pressed, setPressed] = useState(false);

  // Volume réel → échelle des anneaux (phases listening/speaking uniquement).
  useEffect(() => {
    const handler = (e: Event) => {
      analyserRef.current = (e as CustomEvent<AnalyserNode>).detail;
    };
    window.addEventListener("sama:analyser", handler);
    const el = ringsRef.current;
    if (!el) return undefined;
    const loop = () => {
      const an = analyserRef.current;
      let level = 0;
      if (an && (state === "listening" || state === "speaking")) {
        const buf = new Uint8Array(an.frequencyBinCount);
        an.getByteFrequencyData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i];
        level = sum / buf.length / 255;
      }
      const scale = 0.32 + level * 1.05;
      el.style.transform = `scale(${scale})`;
      el.style.opacity = String(0.35 + level * 0.6);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener("sama:analyser", handler);
      cancelAnimationFrame(rafRef.current);
    };
  }, [state]);

  const d = CORE_SIZES[size];
  const dim = state === "connecting" || state === "offline" ? 0.72 : pressed ? 0.94 : 1;

  return (
    <div className={cn("flex flex-col items-center gap-5", className)}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-live="polite"
        disabled={!interactive || state === "offline" || state === "error"}
        onClick={onPress}
        onPointerDown={() => setPressed(true)}
        onPointerUp={() => setPressed(false)}
        onPointerLeave={() => setPressed(false)}
        className={cn(
          "focus-visible group relative rounded-full transition-transform duration-micro ease-out disabled:cursor-not-allowed",
          interactive && !pressed && state === "idle" ? "hover:scale-[1.03]" : "",
          pressed ? "scale-[0.94]" : ""
        )}
        style={{ width: d, height: d, transform: pressed ? "scale(0.94)" : undefined, opacity: dim }}
      >
        {/* anneaux réactifs au volume */}
        <span
          ref={ringsRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full border-2 transition-transform duration-[400ms]"
          style={{ borderColor: RING_COLORS[state], transform: "scale(0.32)" }}
        />
        {/* halo */}
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute rounded-full",
            state === "idle" || state === "connecting" ? "core-breath" : "",
            state === "listening" ? "core-listening" : ""
          )}
          style={{
            inset: 16,
            background: `radial-gradient(circle, ${RING_COLORS[state]} 0%, transparent 70%)`,
          }}
        />
        {/* orbe */}
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-[38px] rounded-full",
            (state === "idle" || state === "connecting") && "core-breath"
          )}
          style={{
            background:
              "linear-gradient(135deg, #0dc98a 0%, #0ab8a0 45%, #38bdf8 100%)",
            boxShadow: `0 0 ${d * 0.35}px rgba(13,201,138,0.4), 0 0 ${d * 0.6}px rgba(56,189,248,0.22)`,
          }}
        />
        {/* cœur verre + micro */}
        <span
          aria-hidden
          className="pointer-events-none absolute flex items-center justify-center rounded-full"
          style={{
            inset: "50%",
            transform: "translate(-50%, -50%)",
            width: d / 2.75,
            height: d / 2.75,
            background: "rgba(4,33,26,0.3)",
            backdropFilter: "blur(6px)",
            border: "1px solid rgba(255,255,255,0.28)",
          }}
        >
          <span
            className="inline-block"
            style={{ width: d / 5.5, height: d / 5.5 }}
          >
            <Mic className="h-full w-full text-white/90" />
          </span>
        </span>
      </button>

      {state !== "idle" ? (
        <p
          aria-live="polite"
          className="flex items-center justify-center gap-2.5 text-center text-lg font-semibold text-text1"
        >
          <span
            aria-hidden
            className={cn(
              "inline-block h-2.5 w-2.5 rounded-full",
              state === "listening" && "bg-primary",
              state === "transcribing" && "bg-accent-ai",
              state === "processing" && "bg-warning animate-pulse",
              state === "speaking" && "bg-accent-ai",
              state === "acting" && "bg-primary animate-pulse",
              state === "waiting_confirmation" && "bg-warning animate-pulse",
              state === "success" && "bg-primary",
              state === "paused" && "bg-text-muted",
              state === "interrupted" && "bg-warning",
              state === "error" && "bg-error",
              state === "offline" && "bg-text-muted",
              state === "connecting" && "bg-text-muted animate-pulse"
            )}
          />
          {CORE_STATE_LABEL[state]}
        </p>
      ) : null}

      {showTranscript ? (
        <p aria-live="polite" className="min-h-[1.5rem] max-w-xl text-center text-base italic text-text2">
          {transcript ?? "…"}
        </p>
      ) : null}
    </div>
  );
}