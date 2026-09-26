"use client";

import { cn } from "@/lib/cn";

/** Spinner accessible (§66) — sourcetype unique pour tout le système. */
export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      aria-label="chargement"
      role="status"
      className={cn(
        "inline-block h-5 w-5 animate-spin rounded-full border-2 border-surface-2 border-t-primary",
        className
      )}
    />
  );
}