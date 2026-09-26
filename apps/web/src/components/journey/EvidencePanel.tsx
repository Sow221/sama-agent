"use client";

import type { Evidence } from "@/lib/schemas";

/** Preuve officielle + limites (C §66) — mention explicite : pas de validation OBLIGATOIRE. */
export function EvidencePanel({ evidence }: { evidence: Evidence }) {
  return (
    <div className="space-y-3">
      <div className="rounded-card border border-white/10 bg-white/[0.05] p-4 backdrop-blur-md">
        <p className="text-xs font-semibold uppercase tracking-widest text-text2">
          Source officielle
        </p>
        <p className="mt-1 font-semibold">{evidence.source}</p>
        {evidence.sourceUrl ? (
          <a
            href={evidence.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="focus-visible mt-1 inline-block text-sm text-accent-ai underline"
          >
            {evidence.sourceUrl}
          </a>
        ) : null}
      </div>
      <div className="rounded-card border border-white/10 bg-white/[0.05] p-4 backdrop-blur-md">
        <p className="font-semibold">Ce qu'il faut</p>
        <p className="mt-1 text-text1">{evidence.description}</p>
      </div>
      <div className="rounded-card border border-warning/30 bg-warning/10 p-4">
        <p className="font-semibold text-warning">À noter</p>
        <ul className="mt-2 space-y-1 text-sm text-text1">
          {evidence.limitations.map((l, i) => (
            <li key={i}>• {l}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}