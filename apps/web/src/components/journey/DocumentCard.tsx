"use client";

import Link from "next/link";
import { AlertIcon, CheckIcon } from "@/components/icons";
import { Badge } from "@/components/ui";
import type { JourneyDocument } from "@/lib/schemas";

const LABELS: Record<string, string> = {
  ANALYZED: "Conforme",
  PROVIDED: "Fourni",
  MISSING: "Manquant",
  NEEDS_REVIEW: "À vérifier",
  UNEXPECTED: "Inattendu",
  UNKNOWN: "Inconnu",
};

/** Carte document du dossier (✓ / !) — lien vers l'écran Preuve (G7). */
export function DocumentCard({
  doc,
  journeyId,
}: {
  doc: JourneyDocument;
  journeyId: string;
}) {
  const ok = doc.status === "ANALYZED";
  const warn = doc.status === "NEEDS_REVIEW" || doc.status === "UNEXPECTED";
  return (
    <Link
      href={`/evidence/${encodeURIComponent(doc.requirementId)}?journey=${journeyId}`}
      className="focus-visible block"
    >
      <div className="flex items-center gap-3 rounded-card border border-white/10 bg-white/[0.05] p-4 backdrop-blur-md transition-colors hover:border-primary/40">
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
            ok
              ? "bg-gradient-to-br from-primary/30 to-accent-ai/20 text-primary"
              : warn
                ? "bg-warning/15 text-warning"
                : "bg-danger/15 text-danger"
          }`}
        >
          {ok ? (
            <CheckIcon className="h-5 w-5" />
          ) : warn ? (
            <AlertIcon className="h-5 w-5" />
          ) : (
            <span className="text-lg font-bold">+</span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{doc.name}</p>
          <Badge tone={ok ? "ok" : warn ? "warn" : "danger"}>{LABELS[doc.status]}</Badge>
        </div>
        <span className="text-xl text-text2">›</span>
      </div>
    </Link>
  );
}