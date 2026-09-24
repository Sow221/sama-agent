"use client";

import { useVoiceStore } from "@/lib/state/stores";

const LABELS: Record<string, string> = {
  connecting: "Connexion…",
  listening: "J'écoute…",
  thinking: "J'analyse…",
  speaking: "Je réponds…",
  idle: "",
};

export function PhaseHeader() {
  const phase = useVoiceStore((s) => s.phase);
  const label = LABELS[phase] ?? "";
  if (!label) return null;
  return (
    <p
      aria-live="polite"
      className="focus-visible text-center text-lg font-semibold text-text1"
    >
      {label}
    </p>
  );
}