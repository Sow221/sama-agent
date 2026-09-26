"use client";

/** État « penser » (processing réel §32) — jamais d'animation décorative (§87). */
export function ThinkingDots({ label = "J'analyse…", className = "" }: { label?: string; className?: string }) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={"inline-flex items-center gap-2 text-base font-semibold text-text1 " + className}
    >
      <span className="flex items-center gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="bounce-dot h-2 w-2 rounded-full bg-primary"
            style={{ animationDelay: `${i * 160}ms` }}
          />
        ))}
      </span>
      {label}
    </span>
  );
}

export function Thinking({ label = "J'analyse…", compact = false }: { label?: string; compact?: boolean }) {
  if (compact) return <ThinkingDots label={label} className="text-sm" />;
  return <ThinkingDots label={label} />;
}