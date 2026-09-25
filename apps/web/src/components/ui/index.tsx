/** Base UI — tokens du thème, styles accessibles (focus visible, ≥16px). */
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "gradient" | "ghost" | "danger" | "accent";
type Size = "md" | "lg";

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
}) {
  const base =
    "focus-visible rounded-full font-semibold transition-transform active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2";
  const variants: Record<Variant, string> = {
    primary: "bg-primary text-[#04211a] shadow-glow",
    gradient:
      "bg-gradient-to-r from-primary to-accent-ai text-[#04211a] shadow-glow",
    ghost: "bg-surface text-text1 border border-surface-2",
    danger: "bg-danger text-white",
    accent: "bg-accent-ai text-[#022c44] shadow-glow",
  };
  const sizes: Record<Size, string> = {
    md: "px-5 py-3 text-base",
    lg: "px-6 py-4 text-lg",
  };
  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    />
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-card bg-surface backdrop-blur-md border border-surface-2 p-4 ${className}`}
    >
      {children}
    </div>
  );
}

/** Carte « vitre » plus marquée (fond, halo) — usage sur mise en avant. */
export function GlassCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-card border border-white/10 bg-white/[0.05] backdrop-blur-xl shadow-[0_8px_32px_rgba(2,6,23,0.45)] ${className}`}
    >
      {children}
    </div>
  );
}

type BadgeTone = "ok" | "warn" | "danger" | "neutral";

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: BadgeTone;
  children: ReactNode;
}) {
  const tones: Record<BadgeTone, string> = {
    ok: "bg-primary/15 text-primary border border-primary/30",
    warn: "bg-warning/15 text-warning border border-warning/30",
    danger: "bg-danger/15 text-danger border border-danger/30",
    neutral: "bg-surface-2 text-text2 border border-surface-2",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function StatusPill({ label, tone }: { label: string; tone: BadgeTone }) {
  return <Badge tone={tone}>{label}</Badge>;
}

export function Spinner() {
  return (
    <span
      aria-label="chargement"
      className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-surface-2 border-t-primary"
    />
  );
}

/** État « penser » (analyse IA réelle) : trois points pulsés. */
export function ThinkingDots({ label = "J'analyse…" }: { label?: string }) {
  return (
    <span
      role="status"
      aria-live="polite"
      className="inline-flex items-center gap-2 text-base font-semibold text-text1"
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