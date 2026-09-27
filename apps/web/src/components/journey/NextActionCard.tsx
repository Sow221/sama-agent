"use client";

import type { JourneyResponse } from "@/lib/schemas";
import {
  BuildingIcon,
  CameraIcon,
  ChatIcon,
  FileIcon,
  InfoIcon,
  SearchIcon,
} from "@/components/icons";
import { requirementLabel } from "@/lib/labels";

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

const ICONS: Record<string, typeof FileIcon> = {
  PROVIDE_DOCUMENT: FileIcon,
  PROVIDE_PHOTOS: CameraIcon,
  REVIEW_DOCUMENT: SearchIcon,
  READ_INFORMATION: InfoIcon,
  CONTACT_SERVICE: BuildingIcon,
  CLARIFY: ChatIcon,
};

export function NextActionCard({ journey }: { journey: JourneyResponse }) {
  if (!journey.nextAction) return null;
  const label =
    journey.nextActionLabel ?? FALLBACK_LABELS[journey.nextAction] ?? "Étape suivante";
  const Icon = ICONS[journey.nextAction] ?? InfoIcon;
  return (
    <div className="rounded-card border border-accent-ai/30 bg-gradient-to-br from-primary/[0.12] via-[var(--surface)] to-accent-ai/[0.12] p-5 backdrop-blur-md">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/25 to-accent-ai/25 text-accent-ai">
          <Icon className="h-5 w-5" />
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
              Pièce concernée : {requirementLabel(journey.nextActionRequirement, journey)}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}