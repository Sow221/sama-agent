"use client";

/**
 * Fichiers — `/app/files` (UI/UX Master Spec §27 Files/Evidence).
 * Vos pièces réelles : les analyses vision de la session (dossier store) ainsi que
 * les exigences du parcours. Aucun fichier fictif : tout provient de vos dépôts.
 */
import Link from "next/link";
import { Badge, Button, Card, EmptyState, ListItem } from "@/components/ui";
import { FileIcon, PlusIcon } from "@/components/icons";
import { useDossierStore, useJourneyStore, usePersistReady } from "@/lib/state/stores";
import type { DocumentAnalysis } from "@/lib/schemas";

function fileTone(status: string): "ok" | "warn" | "danger" | "neutral" {
  if (status === "ANALYZED") return "ok";
  if (status === "NEEDS_REVIEW") return "warn";
  if (status === "REJECTED" || status === "INVALID") return "danger";
  return "neutral";
}

export default function FilesPage() {
  const analyses = useDossierStore((s) => s.analyses);
  const journey = useJourneyStore((s) => s.response);
  const ready = usePersistReady();

  const pieces = Object.entries(analyses).map(([requirementId, a]) => ({ requirementId, a }));
  const pending = (journey?.documents ?? []).filter(
    (r) => !pieces.some((p) => p.requirementId === r.requirementId)
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Fichiers</h1>
          <p className="mt-1 text-sm text-text2">Vos pièces et preuves de dossier.</p>
        </div>
        {journey ? (
          <Link href={`/app/dossier/${journey.journeyId}`} className="focus-visible">
            <Button variant="gradient" size="sm">
              <PlusIcon className="h-4 w-4" /> Déposer
            </Button>
          </Link>
        ) : null}
      </div>

      {ready && pieces.length === 0 ? (
        <EmptyState
          emoji="📁"
          title="Aucun fichier pour l'instant"
          description="Déposez une pièce pour votre parcours : l'analyse (vision) sera conservée ici et dans votre dossier."
          action={
            journey ? (
              <Link href={`/app/dossier/${journey.journeyId}`} className="focus-visible">
                <Button variant="gradient" size="lg">Déposer une pièce</Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {pieces.map(({ requirementId, a }) => (
            <AnalysisFile key={requirementId} requirementId={requirementId} a={a} />
          ))}
        </div>
      )}

      {journey && pending.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h2 className="text-xl font-extrabold tracking-tight">Pièces attendues</h2>
          <div className="flex flex-col gap-2">
            {pending.map((r) => (
              <Card key={r.requirementId} className="p-2">
                <ListItem
                  icon={<FileIcon className="h-5 w-5" />}
                  title={r.name}
                  description={r.requirementId}
                  trailing={<Badge tone="neutral">À fournir</Badge>}
                  href={`/app/dossier/${journey.journeyId}`}
                />
              </Card>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AnalysisFile({ requirementId, a }: { requirementId: string; a: DocumentAnalysis }) {
  return (
    <Card className="p-2">
      <ListItem
        icon={<FileIcon className="h-5 w-5" />}
        title={a.fileName ?? requirementId}
        description={requirementId}
        trailing={
          <Badge tone={fileTone(a.status)}>
            {a.confidence != null && a.status === "ANALYZED"
              ? `${Math.round(a.confidence * 100)}%`
              : a.status}
          </Badge>
        }
        href={`/app/memory/${encodeURIComponent(requirementId)}`}
      />
    </Card>
  );
}