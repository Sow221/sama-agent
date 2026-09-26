"use client";

/**
 * PhaseHeader — libellé PILOTÉ par la phase réelle de la session vocale (§30-32).
 * Mapping CoreState vers labels, pastille de couleur par état (jamais deviné).
 */
import { CORE_STATE_LABEL, type CoreState } from "./VoiceCore";

const DOT: Record<CoreState, string> = {
  idle: "bg-primary",
  connecting: "bg-text-muted animate-pulse",
  listening: "bg-primary",
  transcribing: "bg-accent-ai",
  processing: "bg-warning animate-pulse",
  speaking: "bg-accent-ai",
  acting: "bg-primary animate-pulse",
  waiting_confirmation: "bg-warning animate-pulse",
  success: "bg-primary",
  paused: "bg-text-muted",
  interrupted: "bg-warning",
  error: "bg-error",
  offline: "bg-text-muted",
};

export function PhaseHeader({ state }: { state: CoreState }) {
  const label = CORE_STATE_LABEL[state];
  if (!label) return null;
  return (
    <p
      aria-live="polite"
      className="flex items-center justify-center gap-2.5 text-center text-lg font-semibold text-text1"
    >
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${DOT[state]}`} />
      {label}
    </p>
  );
}