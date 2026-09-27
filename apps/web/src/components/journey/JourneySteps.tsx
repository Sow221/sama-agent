"use client";

import type { JourneyStep } from "@/lib/schemas";

/**
 * Les 4 étapes du parcours : Comprendre ✓ · Préparer ● · Vérifier · Agir (B §39).
 * Valeurs 100 % serveur (steps du moteur) — le style suit l'état réel.
 */
export function JourneySteps({ steps }: { steps: JourneyStep[] }) {
  return (
    <ol className="flex items-start justify-between gap-1">
      {steps.map((s, i) => {
        const done = s.status === "done";
        const active = s.status === "active";
        const hasNext = i < steps.length - 1;
        // la ligne entre i et i+1 est remplie quand l'étape i est faite
        return (
          <li key={s.id} className="relative flex flex-1 flex-col items-center gap-1.5 text-center">
            <span
              className={`relative flex h-10 w-10 items-center justify-center rounded-full border text-sm font-bold ${
                done
                  ? "border-primary bg-gradient-to-br from-primary/30 to-accent-ai/20 text-primary"
                  : active
                    ? "border-warning bg-warning/15 text-warning"
                    : "border-border bg-surface text-text2"
              }`}
            >
              {done ? "✓" : i + 1}
              {active ? (
                <span className="ring-pulse absolute inset-0 rounded-full border-2 border-warning/70" />
              ) : null}
            </span>
            <span
              className={`max-w-[72px] text-xs leading-tight ${
                done || active ? "font-semibold text-text1" : "text-text2"
              }`}
            >
              {s.name}
            </span>
            {hasNext ? (
              <span
                aria-hidden
                className={`absolute left-[calc(50%+22px)] top-[20px] h-px w-[calc(100%-44px)] ${
                  done
                    ? "bg-gradient-to-r from-primary to-accent-ai"
                    : "bg-surface-2"
                }`}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}