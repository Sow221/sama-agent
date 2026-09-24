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

export function NextActionCard({ journey }: { journey: JourneyResponse }) {
  if (!journey.nextAction) return null;
  const label =
    journey.nextActionLabel ?? FALLBACK_LABELS[journey.nextAction] ?? journey.nextAction;
  return (
    <div className="rounded-card bg-gradient-to-br from-violet-500/20 via-blue-500/15 to-cyan-400/20 border border-accent-ai/30 p-4">
      <p className="text-sm text-text2">Prochaine action</p>
      <p className="mt-1 text-lg font-semibold text-text1">{label}</p>
      {journey.nextActionReason ? (
        <p className="mt-1 text-sm text-text2">{journey.nextActionReason}</p>
      ) : null}
      {journey.nextActionRequirement ? (
        <p className="mt-1 text-sm text-text2">
          Élément : {journey.nextActionRequirement}
        </p>
      ) : null}
    </div>
  );
}