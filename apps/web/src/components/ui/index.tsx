/**
 * Système de composants UI — UI/UX Master Spec §28-29, §108-111.
 * Matrice d'états normalisée : default · hover · pressed · focus · disabled ·
 * loading · error · success. Le même composant est réutilisé partout (§152).
 */
"use client";

import {
  forwardRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import { Spinner } from "./spinner";
import { ThinkingDots } from "./thinking";
import { AlertIcon, FileIcon, UserIcon, WifiOffIcon } from "@/components/icons";

/* ═══════════════ Button (§108) ═══════════════ */
export type ButtonVariant =
  | "primary"
  | "gradient"
  | "secondary"
  | "ghost"
  | "destructive"
  | "icon";
export type ButtonSize = "sm" | "md" | "lg";

const BTN_BASE =
  "focus-visible inline-flex items-center justify-center gap-2 rounded-full font-semibold " +
  "transition-all duration-micro ease-out active:scale-[0.97] " +
  "disabled:cursor-not-allowed disabled:opacity-40";

const BTN_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-primary text-[#04211a] shadow-glow hover:bg-[#16d99a]",
  gradient:
    "bg-gradient-to-r from-primary to-accent-ai text-[#04211a] shadow-glow hover:brightness-110",
  secondary: "bg-surface-elevated text-text1 border border-border hover:bg-surface-hover",
  ghost: "bg-transparent text-text1 hover:bg-surface-hover",
  destructive: "bg-error text-white hover:brightness-110",
  icon: "bg-transparent text-text2 hover:bg-surface-hover hover:text-text1",
};

const BTN_SIZES: Record<ButtonSize, string> = {
  sm: "min-h-11 px-4 text-base",
  md: "min-h-12 px-5 text-base",
  lg: "min-h-14 px-6 text-lg",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { variant = "primary", size = "md", loading = false, className = "", children, disabled, ...props },
    ref
  ) {
    return (
      <button
        ref={ref}
        className={`${BTN_BASE} ${BTN_VARIANTS[variant]} ${BTN_SIZES[size]} ${className}`}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading ? <Spinner className="h-4 w-4 border-2" /> : null}
        {children}
      </button>
    );
  }
);

/* ═══════════════ IconButton (§108) ═══════════════ */
export const IconButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { label: string }
>(function IconButton({ label, className = "", ...props }, ref) {
  return (
    <button
      ref={ref}
      aria-label={label}
      title={label}
      className={`focus-visible flex h-11 w-11 items-center justify-center rounded-full text-text2 transition-colors duration-micro hover:bg-surface-hover hover:text-text1 ${className}`}
      {...props}
    />
  );
});

/* ═══════════════ Input / Textarea / Search (§109) ═══════════════ */
const FIELD_BASE =
  "w-full rounded-md border border-border bg-surface px-4 py-3 text-base text-text1 placeholder:text-text-muted " +
  "transition-colors duration-micro focus:border-strong focus:outline-none focus:ring-2 focus:ring-primary/40 " +
  "disabled:cursor-not-allowed disabled:bg-surface disabled:text-text-disabled";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = "", ...props }, ref) {
    return <input ref={ref} className={`${FIELD_BASE} ${className}`} {...props} />;
  }
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className = "", ...props }, ref) {
  return (
    <textarea ref={ref} className={`${FIELD_BASE} resize-none leading-relaxed ${className}`} {...props} />
  );
});

export function SearchInput({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={`relative ${className}`}>
      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-muted">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
      </span>
      <Input type="search" className="pl-11" aria-label="Rechercher" {...props} />
    </div>
  );
}

/* ═══════════════ Avatar (§111) ═══════════════ */
const AVATAR_SIZES = { sm: "h-6 w-6 text-xs", md: "h-8 w-8 text-sm", lg: "h-10 w-10 text-base", xl: "h-12 w-12 text-lg" } as const;

export function Avatar({
  name = "?",
  size = "md",
  className = "",
}: {
  name?: string | null;
  size?: keyof typeof AVATAR_SIZES;
  className?: string;
}) {
  const initials = (name ?? "?")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  return (
    <span
      aria-hidden
      className={`inline-flex items-center justify-center rounded-full bg-gradient-to-br from-primary/40 to-accent-ai/30 font-bold text-text1 ${AVATAR_SIZES[size]} ${className}`}
    >
      {initials || <UserIcon className="h-[60%] w-[60%]" />}
    </span>
  );
}

/* ═══════════════ Card (§107) ═══════════════ */
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-card border border-border bg-surface backdrop-blur-md p-4 ${className}`}>
      {children}
    </div>
  );
}

export function GlassCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-card border border-white/10 bg-white/[0.05] backdrop-blur-xl shadow-elevated ${className}`}
    >
      {children}
    </div>
  );
}

/* ═══════════════ Badge / StatusPill ═══════════════ */
export type BadgeTone = "ok" | "warn" | "danger" | "neutral" | "info";

const BADGE_TONES: Record<BadgeTone, string> = {
  ok: "bg-success/15 text-success border border-success/30",
  warn: "bg-warning/15 text-warning border border-warning/30",
  danger: "bg-error/15 text-[#fca5a5] border border-error/30",
  neutral: "bg-surface-2 text-text2 border border-border",
  info: "bg-accent-soft text-accent-ai border border-accent-ai/30",
};

export function Badge({
  tone = "neutral",
  children,
  className = "",
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium ${BADGE_TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function StatusPill({ label, tone }: { label: string; tone: BadgeTone }) {
  return <Badge tone={tone} className="whitespace-nowrap">{label}</Badge>;
}

/**
 * Place d'attente pendant l'hydratation des stores persistés (zustand v5).
 *
 * Ces pages avaient `if (!ready) return null;` : pendant la fenêtre
 * d'hydratation — le temps d'un aller-retour `sessionStorage`, donc visible à
 * chaque navigation — l'écran rendait **rien du tout**. L'usager voit un vide,
 * pas un chargement ; sur réseau lent ou storage bloqué, ce vide peut durer.
 *
 * Le garde-fou lui-même est bon (agir sur un store non hydraté écraserait un
 * dossier porteur d'analyses, point 6) : c'est son rendu qui était faux. On dit
 * ce qui se passe, on ne simule aucune donnée.
 */
export function Hydrating({ label = "Chargement de votre dossier…" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="hydrating"
      className="flex min-h-[40vh] flex-col items-center justify-center gap-3"
    >
      <ThinkingDots label={label} />
    </div>
  );
}

/* ═══════════════ Tabs (§28) ═══════════════ */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
}: {
  items: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    // Défile horizontalement si les onglets dépassent (mobile 360–390 px) au lieu
    // d'élargir la page entière (défilement horizontal de tout l'écran).
    <div
      role="tablist"
      className="flex max-w-full gap-1 overflow-x-auto rounded-full border border-border bg-surface p-1 [scrollbar-width:none]"
    >
      {items.map((it) => {
        const active = it.id === value;
        return (
          <button
            key={it.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(it.id)}
            className={`focus-visible flex-1 shrink-0 whitespace-nowrap rounded-full px-3 py-2.5 text-sm font-semibold transition-colors duration-micro sm:px-4 ${
              active ? "bg-primary text-[#04211a]" : "text-text2 hover:text-text1"
            }`}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

/* ═══════════════ ListItem (§28) ═══════════════ */
export function ListItem({
  icon,
  title,
  description,
  trailing,
  href,
  onClick,
  disabled,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  trailing?: ReactNode;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const Root = href ? "a" : "button";
  return (
    <Root
      href={href}
      onClick={onClick}
      aria-disabled={disabled}
      className={`focus-visible flex min-h-16 w-full items-center gap-4 rounded-lg px-4 py-3 text-left transition-colors duration-micro ${
        disabled ? "cursor-not-allowed opacity-50" : "hover:bg-surface-hover"
      }`}
    >
      {icon ? (
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-text2">
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-semibold text-text1">{title}</span>
        {description ? <span className="mt-0.5 block truncate text-sm text-text2">{description}</span> : null}
      </span>
      {trailing ? <span className="shrink-0 text-text-muted">{trailing}</span> : null}
    </Root>
  );
}

/* ═══════════════ Progress (§28) ═══════════════ */
export function Progress({
  value,
  max = 1,
  tone = "ok",
  label,
}: {
  value: number;
  max?: number;
  tone?: BadgeTone;
  label?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const color: Record<BadgeTone, string> = {
    ok: "bg-success",
    warn: "bg-warning",
    danger: "bg-error",
    neutral: "bg-text-muted",
    info: "bg-accent-ai",
  };
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className="h-2 w-full overflow-hidden rounded-full bg-surface-elevated"
    >
      <div className={`h-full rounded-full transition-all duration-ui ${color[tone]}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ═══════════════ Skeleton / Loader (§66) ═══════════════ */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`shimmer rounded-md ${className}`} />;
}

export function SkeletonCard({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <Card className={className}>
      <div className="flex flex-col gap-3">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className={i === 0 ? "h-5 w-2/3" : "h-4 w-full"} />
        ))}
      </div>
    </Card>
  );
}

/* ═══════════════ États de page (§37, §65-68) ═══════════════ */

export function EmptyState({
  emoji = <FileIcon className="h-9 w-9" />,
  title,
  description,
  action,
}: {
  /** Icône SVG de l'état vide (jamais un emoji : rendu variable selon l'OS). */
  emoji?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-12 text-center">
      <span aria-hidden className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.05] text-accent-ai">
        {emoji}
      </span>
      <h2 className="text-lg font-bold text-text1">{title}</h2>
      {description ? <p className="max-w-sm text-sm text-text2">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = "Une erreur est survenue",
  description,
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-xl border border-error/25 bg-error/10 px-6 py-10 text-center"
    >
      <AlertIcon className="h-8 w-8 text-error" />
      <h2 className="text-lg font-bold text-text1">{title}</h2>
      {description ? <p className="max-w-sm text-sm text-text2">{description}</p> : null}
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry} className="mt-2">
          Réessayer
        </Button>
      ) : null}
    </div>
  );
}

export function OfflineBanner({ text = "Vous êtes hors ligne." }: { text?: string }) {
  return (
    <p
      role="status"
      className="flex items-center gap-2 rounded-full border border-warning/30 bg-warning/10 px-4 py-2 text-sm font-medium text-warning"
    >
      <WifiOffIcon className="h-4 w-4" /> {text}
    </p>
  );
}

/* ═══════════════ Tooltip (§5) ═══════════════ */
export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-full top-1/2 z-dropdown ml-3 -translate-y-1/2 whitespace-nowrap rounded-md border border-border bg-surface-elevated px-3 py-1.5 text-sm text-text1 opacity-0 transition-opacity duration-micro group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {label}
      </span>
    </span>
  );
}

/* Rétrocompat : ThinkingDots = Thinking (§66) */
export { Spinner } from "./spinner";
export { ThinkingDots, Thinking } from "./thinking";
export { ErrorNotice } from "./error-notice";