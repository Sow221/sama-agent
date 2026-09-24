"use client";

/**
 * VoiceVisualizer (ADR-008) : orbe dégradé violet/bleu + 2 « yeux » de l'IA
 * + anneaux réactifs. Les anneaux réagissent au VOLUME RÉEL :
 *  - phase listening → analyseur du micro entrant
 *  - phase speaking  → analyseur de la voix TTS sortante (réelle)
 * Aucun contenu textuel simulé : uniquement le volume physique.
 */
import { useEffect, useRef } from "react";
import { useVoiceStore } from "@/lib/state/stores";

export function VoiceVisualizer() {
  const phase = useVoiceStore((s) => s.phase);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number>(0);

  // L'écran Voice fournit l'analyser via un événement custom (volume réel).
  useEffect(() => {
    const handler = (e: Event) => {
      analyserRef.current = (e as CustomEvent<AnalyserNode>).detail;
    };
    window.addEventListener("sama:analyser", handler);
    return () => window.removeEventListener("sama:analyser", handler);
  }, []);

  useEffect(() => {
    const el = document.getElementById("rings");
    if (!el) return;
    const loop = () => {
      const an = analyserRef.current;
      let level = 0;
      if (an && phase !== "idle" && phase !== "connecting") {
        const buf = new Uint8Array(an.frequencyBinCount);
        an.getByteFrequencyData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i];
        level = sum / buf.length / 255;
      }
      // scale des anneaux 0.3 → 1.25 selon le volume réel
      const scale = 0.3 + level * 1.1;
      el.style.transform = `scale(${scale})`;
      el.style.opacity = String(0.35 + level * 0.6);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase]);

  return (
    <div className="relative flex h-[280px] w-[280px] items-center justify-center" aria-hidden>
      {/* anneaux réactifs au volume réel */}
      <div
        id="rings"
        className="absolute inset-0 rounded-full border-2 border-accent-ai/60"
        style={{ transform: "scale(0.3)", opacity: 0.35 }}
      />
      <div className="absolute inset-4 rounded-full border border-accent-ai/30" />
      {/* orbe dégradé violet/bleu */}
      <div
        className={`relative flex h-44 w-44 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 via-blue-500 to-cyan-400 shadow-glow ${
          phase === "thinking" ? "animate-spin-slow" : "animate-pulse-slow"
        }`}
      >
        {/* les deux « yeux » de l'IA */}
        <div className="flex gap-5">
          <span className="h-4 w-4 rounded-full bg-white" />
          <span className="h-4 w-4 rounded-full bg-white" />
        </div>
      </div>
    </div>
  );
}