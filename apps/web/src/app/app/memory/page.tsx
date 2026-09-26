"use client";

/**
 * Mémoire — `/app/memory` (UI/UX Master Spec §20-21, §45, §65).
 * Ce que l'agent retient de la session : vos pièces analysées (vision réelle),
 * vos préférences, et ce qui est « important » (limites). Aucun artefact factice :
 * tout ce qui apparaît provient de données réellement fournies.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Badge, Button, Card, EmptyState, ListItem, SearchInput, SkeletonCard, Tabs } from "@/components/ui";
import { Modal, useToast } from "@/components/ui/overlays";
import { FileIcon, InfoIcon, MemoryIcon } from "@/components/icons";
import { useDossierStore, useJourneyStore, usePersistReady } from "@/lib/state/stores";
import { MEMORY_KIND_LABEL, useDeleteMemory, useMemories } from "@/lib/query/conversations";
import { documentStatusLabel, requirementLabel } from "@/lib/labels";
import type { DocumentAnalysis, ServerMemoryItem } from "@/lib/schemas";

type Tab = "pieces" | "preferences" | "important" | "souvenirs";

function statusTone(status: string): "ok" | "warn" | "danger" | "neutral" {
  if (status === "ANALYZED") return "ok";
  if (status === "NEEDS_REVIEW") return "warn";
  if (status === "UNEXPECTED") return "danger";
  return "neutral";
}

export default function MemoryPage() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>("pieces");
  const [query, setQuery] = useState("");
  const [pendingDelete, setPendingDelete] = useState<ServerMemoryItem | null>(null);
  const analyses = useDossierStore((s) => s.analyses);
  const journey = useJourneyStore((s) => s.response);
  const ready = usePersistReady();
  // Mémoire SERVEUR : celle que l'agent relit à chaque tour (/api/memory).
  const memories = useMemories();
  const items = memories.data ?? [];
  const forget = useDeleteMemory();
  const toast = useToast();

  /* Cible d'onglet depuis la recherche globale (AppSystemUI → ?tab=souvenirs) */
  useEffect(() => {
    const t = searchParams.get("tab");
    if (t === "pieces" || t === "preferences" || t === "important" || t === "souvenirs") {
      setTab(t);
    }
  }, [searchParams]);

  const entries = Object.entries(analyses).filter(([, a]) =>
    (a.fileName ?? a.requirementId).toLowerCase().includes(query.trim().toLowerCase())
  );

  async function confirmForget() {
    if (!pendingDelete) return;
    await forget.mutateAsync(pendingDelete.id);
    toast.toast({ title: "Souvenir oublié.", tone: "neutral" });
    setPendingDelete(null);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Mémoire</h1>
        <p className="mt-1 text-sm text-text2">
          Ce que Sama Agent retient — uniquement ce que vous lui confiez.
        </p>
      </div>

      <Tabs<Tab>
        items={[
          { id: "pieces", label: "Pièces" },
          { id: "preferences", label: "Préférences" },
          { id: "important", label: "Important" },
          { id: "souvenirs", label: "Souvenirs" },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "preferences" ? (
        <div className="flex flex-col gap-3">
          <Card className="flex items-start gap-3">
            <MemoryIcon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="font-semibold">Langue</p>
              <p className="mt-0.5 text-sm text-text2">
                À la voix : wolof (reconnaissance par déclaration). À l'écrit : français.
              </p>
            </div>
          </Card>
          <Card className="flex items-start gap-3">
            <InfoIcon className="mt-0.5 h-5 w-5 shrink-0 text-accent-ai" />
            <div>
              <p className="font-semibold">Règle de confidentialité</p>
              <p className="mt-0.5 text-sm text-text2">
                Aucune mémoire automatique : seul ce que vous fournissez (demande, pièces) est
                conservé, et le dossier vous appartient.
              </p>
            </div>
          </Card>
        </div>
      ) : null}

      {tab === "important" ? (
        <div className="flex flex-col gap-3">
          <Card className="flex items-start gap-3">
            <InfoIcon className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <div>
              <p className="font-semibold">Limites de l'analyse</p>
              <p className="mt-0.5 text-sm text-text2">
                Une pièce « ANALYSÉE » n'est pas une validation officielle : la vérification
                définitive relève du service compétent (CAPP Karangë).
              </p>
            </div>
          </Card>
          {journey ? (
            <Link href="/limits" className="focus-visible">
              <Card className="transition-colors hover:border-primary/40">
                <p className="text-sm font-semibold text-accent-ai">
                  Voir toutes les limites de l'application →
                </p>
              </Card>
            </Link>
          ) : null}
        </div>
      ) : null}

      {tab === "souvenirs" ? (
        memories.isLoading ? (
          <SkeletonCard lines={2} />
        ) : items.length === 0 ? (
          <EmptyState
            emoji={<MemoryIcon className="h-9 w-9" />}
            title="Rien de mémorisé pour l'instant"
            description="Dans une conversation, choisissez « Mémoriser » sous une réponse, ou confiez une information à l'agent : il la gardera pour vos prochains échanges."
          />
        ) : (
          <div className="flex flex-col gap-2">
            {items.map((item) => (
              <Card key={item.id} className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-text1">{item.content}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Badge tone="info">{MEMORY_KIND_LABEL[item.kind]}</Badge>
                      <span className="text-xs text-text-muted">
                        {new Date(item.createdAt).toLocaleDateString("fr-FR", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPendingDelete(item)}
                    className="shrink-0 text-text-muted hover:text-error"
                  >
                    Oublier
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )
      ) : null}

      <Modal
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title="Oublier ce souvenir ?"
        description="Il sera retiré de la mémoire de Sama Agent. Cette action est définitive."
        destructive
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingDelete(null)}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={confirmForget} loading={forget.isPending}>
              Oublier
            </Button>
          </>
        }
      />

      {tab === "pieces" ? (
        <>
          <SearchInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher une pièce" />
          {ready && entries.length === 0 ? (
            <EmptyState
              emoji={<MemoryIcon className="h-9 w-9" />}
              title="Rien de mémorisé pour l'instant"
              description="Les pièces que vous déposerez pour votre dossier apparaîtront ici (analyse réelle par vision)."
              action={
                journey ? (
                  <Link href={`/app/dossier/${journey.journeyId}`} className="focus-visible">
                    <Badge tone="info" className="px-4 py-2 text-sm">
                      Déposer une pièce
                    </Badge>
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <div className="flex flex-col gap-2">
              {entries.map(([requirementId, a]) => (
                <AnalysisRow key={requirementId} requirementId={requirementId} analysis={a} />
              ))}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

function AnalysisRow({ requirementId, analysis }: { requirementId: string; analysis: DocumentAnalysis }) {
  return (
    <Card className="p-2">
      <ListItem
        icon={<FileIcon className="h-5 w-5" />}
        title={analysis.fileName ?? requirementLabel(requirementId)}
        description={requirementLabel(requirementId)}
        trailing={
          <Badge tone={statusTone(analysis.status)}>
            {analysis.confidence != null && analysis.status === "ANALYZED"
              ? `${Math.round(analysis.confidence * 100)}%`
              : documentStatusLabel(analysis.status)}
          </Badge>
        }
        href={`/app/memory/${encodeURIComponent(requirementId)}`}
      />
    </Card>
  );
}