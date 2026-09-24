"use client";

import { CloseIcon } from "@/components/icons";

/** « ✕ Annuler » : micro coupé, audio stoppé, retour accueil (ADR-008). */
export function CancelButton({ onCancel }: { onCancel: () => void }) {
  return (
    <button
      type="button"
      onClick={onCancel}
      className="focus-visible flex items-center gap-2 rounded-full border border-surface-2 bg-surface px-5 py-3 text-base font-semibold text-text1 transition-transform active:scale-[0.98]"
    >
      <CloseIcon className="h-5 w-5" />
      Annuler
    </button>
  );
}