"use client";

/** Écran Limites — transparence honnête (C §16/§66) — spec §63 Help. */
import { GlassCard } from "@/components/ui";

const LIMITS = [
  "Sama Agent est un assistant d'accompagnement, pas une administration.",
  "L'analyse d'un document n'est pas une validation administrative officielle.",
  "La vérification définitive relève du service compétent (CAPP Karangë).",
  "Les informations affichées proviennent de sources officielles, vérifiées au moment de la démonstration.",
];

export default function LimitesPage() {
  return (
    <section className="flex flex-col gap-6 pt-8">
      <div>
        <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-semibold uppercase tracking-widest text-warning">
          Transparence
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Limites</h1>
        <p className="mt-1 text-sm text-text2">
          Ce que Sama Agent est, et ce qu'il n'est pas.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        {LIMITS.map((l, i) => (
          <GlassCard key={i} className="flex items-start gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-warning/40 text-xs font-bold text-warning">
              {i + 1}
            </span>
            <p className="text-text1">{l}</p>
          </GlassCard>
        ))}
      </div>
    </section>
  );
}