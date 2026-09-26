"use client";

/**
 * Mémoire — détail d'une pièce (`/app/memory/[memoryId]`).
 * Données réelles de l'analyse vision (status ANALYZED ≠ VALIDATED, G11),
 * observations factuelles, révision humaine requise, lien vers la preuve officielle.
 */
import Link from "next/link";
import { useParams } from "next/navigation";
import { Badge, Button, Card, EmptyState, Progress } from "@/components/ui";
import { ArrowRightIcon } from "@/components/icons";
import { useDossierStore, usePersistReady } from "@/lib/state/stores";
import { useEvidence } from "@/lib/query/hooks";

function statusTone(status: string): "ok" | "warn" | "danger" | "neutral" {
  if (status === "ANALYZED") return "ok";
  if (status === "NEEDS_REVIEW") return "warn";
  if (status === "REJECTED" || status === "INVALID") return "danger";
  return "neutral";
}

export default function MemoryDetailPage() {
  const { memoryId } = useParams<{ memoryId: string }>();
  const requirementId = decodeURIComponent(memoryId);
  const analysis = useDossierStore((s) => s.analyses[requirementId]);
  const ready = usePersistReady();
  const evidence = useEvidence(requirementId);

  if (!ready) return null;

  if (!analysis) {
    return (
      <EmptyState
        emoji="🧠"
        title="Pièce introuvable"
        description={`Aucune analyse enregistrée pour « ${requirementId} » dans cette session.`}
      />
    );
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">Pièce de dossier</p>
        <h1 className="mt-1 truncate text-2xl font-extrabold">{analysis.fileName ?? requirementId}</h1>
        <p className="mt-1 text-sm text-text2">{requirementId}</p>
      </div>

      <Card className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold uppercase tracking-widest text-text-muted">Analyse par vision</span>
          <Badge tone={statusTone(analysis.status)}>{analysis.status}</Badge>
        </div>

        {analysis.confidence != null ? (
          <>
            <Progress value={analysis.confidence} label="Confiance de l'analyse" tone={statusTone(analysis.status) === "ok" ? "ok" : "warn"} />
            <p className="text-xs text-text-muted">
              Confiance : {Math.round(analysis.confidence * 100)}% — la vérification définitive relève du
              service compétent.
            </p>
          </>
        ) : null}

        {analysis.observations.length > 0 ? (
          <div>
            <p className="text-sm font-semibold">Observations factuelles</p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {analysis.observations.map((o, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-text2">
                  <span aria-hidden className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-text-muted" />
                  {o}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {analysis.requiresHumanReview ? (
          <p role="status" className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm font-medium text-warning">
            ⚠️ Cette pièce demande une vérification humaine avant d'être retenue.
          </p>
        ) : null}
      </Card>

      {evidence.data ? (
        <Card className="flex flex-col gap-2">
          <p className="text-sm font-semibold">Preuve officielle</p>
          <p className="text-sm text-text2">{evidence.data.source}</p>
          {evidence.data.sourceUrl ? (
            <a
              href={evidence.data.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="focus-visible truncate text-sm font-semibold text-accent-ai underline underline-offset-4"
            >
              {evidence.data.sourceUrl}
            </a>
          ) : null}
          {evidence.data.limitations.length > 0 ? (
            <p className="text-xs text-text-muted">{evidence.data.limitations.join(" — ")}</p>
          ) : null}
        </Card>
      ) : null}

      <Link
        href={`/app/evidence/${encodeURIComponent(requirementId)}`}
        className="focus-visible"
      >
        <Button variant="secondary" className="w-full">
          Détail de l'exigence/pièce
          <ArrowRightIcon className="h-4 w-4" />
        </Button>
      </Link>
    </div>
  );
}