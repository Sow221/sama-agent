"use client";

import type { JourneyResponse } from "@/lib/schemas";

/**
 * Prochaine action — label + raison FOURNIS par le moteur déterministe
 * (source unique enums.json, point 12). Le front n'invente rien ;
 * le mapping ci-dessous n'est qu'un filet de sécurité si le champ est absent.
 */
const FALLBACK_LABELS: Record<string, string> = {
  PROVIDE_DOCUMENT: "Fournir un document",
  PROVIDE_PHOTOS: "Fournir les photographies",
  REVIEW_DOCUMENT: "Vérifier un document",
  READ_INFORMATION: "Lire les informations",
  CONTACT_SERVICE: "Contacter le service",
  CLARIFY: "Préciser la demande",
};

const ICONS: Record<string, string> = {
  PROVIDE_DOCUMENT: "📄",
  PROVIDE_PHOTOS: "📷",
  REVIEW_DOCUMENT: "🔎",
  READ_INFORMATION: "📖",
  CONTACT_SERVICE: "🏛️",
  CLARIFY: "💬",
};

export function NextActionCard({ journey }: { journey: JourneyResponse }) {
  if (!journey.nextAction) return null;
  const label =
    journey.nextActionLabel ?? FALLBACK_LABELS[journey.nextAction] ?? journey.nextAction;
  return (
    <div className="rounded-card border border-accent-ai/30 bg-gradient-to-br from-primary/[0.12] via-white/[0.05] to-accent-ai/[0.12] p-5 backdrop-blur-md">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/25 to-accent-ai/25 text-xl">
          {ICONS[journey.nextAction] ?? "→"}
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-text2">
            Prochaine action
          </p>
          <p className="mt-1 text-lg font-bold leading-snug text-text1">{label}</p>
          {journey.nextActionReason ? (
            <p className="mt-1 text-sm text-text2">{journey.nextActionReason}</p>
          ) : null}
          {journey.nextActionRequirement ? (
            <p className="mt-1 text-xs text-text2">
              Élément : {journey.nextActionRequirement}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}