"use client";

/**
 * PhaseHeader — libellé PILOTÉ par la phase réelle de la session vocale
 * (VoicePhase du store : connecting/listening/thinking/speaking/idle).
 * Pastille de couleur par état + libellé (aucun contenu simulé).
 */
import { useVoiceStore } from "@/lib/state/stores";

const META: Record<string, { label: string; dot: string }> = {
  connecting: { label: "Connexion…", dot: "bg-text2" },
  listening: { label: "J'écoute…", dot: "bg-primary" },
  thinking: { label: "J'analyse…", dot: "bg-warning" },
  speaking: { label: "Je réponds…", dot: "bg-accent-ai" },
  idle: { label: "", dot: "" },
};

export function PhaseHeader() {
  const phase = useVoiceStore((s) => s.phase);
  const meta = META[phase];
  if (!meta || !meta.label) return null;
  return (
    <p
      aria-live="polite"
      className="flex items-center justify-center gap-2.5 text-center text-lg font-semibold text-text1"
    >
      <span
        className={`inline-block h-2.5 w-2.5 rounded-full ${meta.dot} ${
          phase === "thinking" ? "animate-pulse" : ""
        }`}
      />
      {meta.label}
    </p>
  );
}