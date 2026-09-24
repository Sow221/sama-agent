"use client";

import type { JourneyStep } from "@/lib/schemas";

/** Les 4 étapes du parcours : Comprendre ✓ · Préparer ● · Vérifier · Agir (B §39). */
export function JourneySteps({ steps }: { steps: JourneyStep[] }) {
  return (
    <ol className="flex items-center justify-between gap-1">
      {steps.map((s, i) => (
        <li key={s.id} className="flex flex-1 flex-col items-center gap-1 text-center">
          <span
            className={`focus-visible flex h-9 w-9 items-center justify-center rounded-full border text-sm font-bold ${
              s.status === "done"
                ? "border-primary bg-primary/15 text-primary"
                : s.status === "active"
                  ? "border-warning bg-warning/15 text-warning"
                  : "border-surface-2 bg-surface text-text2"
            }`}
          >
            {s.status === "done" ? "✓" : i + 1}
          </span>
          <span className="text-xs text-text2">{s.name}</span>
        </li>
      ))}
    </ol>
  );
}