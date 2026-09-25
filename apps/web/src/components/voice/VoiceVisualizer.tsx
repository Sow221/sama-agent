"use client";

/**
 * VoiceVisualizer (ADR-008) : orbe dégradé vert/bleu (identité Sama Agent)
 * + anneaux réactifs. Les anneaux réagissent au VOLUME RÉEL :
 *  - phase listening → analyseur du micro entrant
 *  - phase speaking  → analyseur de la voix TTS sortante (réelle)
 *  - phase connecting/thinking → pulsation douce (état réel de la session)
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
      {/* halo doux derrière l'orbe (état réel) */}
      <div className="glow-orb absolute inset-8 rounded-full bg-[radial-gradient(circle,rgba(13,201,138,0.28),transparent_68%)]" />

      {/* anneaux réactifs au volume réel */}
      <div
        id="rings"
        className="absolute inset-0 rounded-full border-2 border-accent-ai/60"
        style={{ transform: "scale(0.3)", opacity: 0.35 }}
      />
      <div className="absolute inset-4 rounded-full border border-accent-ai/30" />

      {/* orbe dégradé vert/bleu — identité du projet */}
      <div
        className={`relative flex h-44 w-44 items-center justify-center rounded-full bg-gradient-to-br from-primary via-[#0ab8a0] to-accent-ai ${
          phase === "thinking" ? "animate-spin-slow" : "animate-pulse-slow"
        }`}
        style={{ boxShadow: "0 0 60px rgba(13,201,138,0.45), 0 0 120px rgba(56,189,248,0.25)" }}
      >
        {/* pulsation d'écoute à l'intérieur de l'orbe */}
        {phase === "listening" ? <span className="ring-pulse absolute inset-0 rounded-full border-2 border-white/40" /> : null}
        {/* noyau : reflet + micro stable */}
        <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-[#04211a]/25 backdrop-blur-sm">
          <div className="absolute inset-0 rounded-full bg-white/10" style={{ clipPath: "polygon(20% 0, 100% 0, 100% 100%, 20% 100%)" }} />
          <svg className="h-8 w-8 text-white/90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="2" width="6" height="12" rx="3" />
            <path d="M5 10a7 7 0 0 0 14 0" />
            <path d="M12 19v3" />
          </svg>
        </div>
      </div>
    </div>
  );
}