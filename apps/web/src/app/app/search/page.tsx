"use client";

/**
 * Recherche — `/app/search` (UI/UX Master Spec §50-52, §65).
 * Recherche locale réelle sur les données de la session : pièces analysées,
 * exigences du parcours, fichiers. Résultats vides = état honnête (aucun faux
 * résultat produit, §153).
 */
import { documentStatusLabel, procedureLabel, requirementLabel } from "@/lib/labels";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Card, EmptyState, ListItem, SearchInput } from "@/components/ui";
import { FileIcon, HomeIcon, SearchIcon } from "@/components/icons";
import { useDossierStore, useJourneyStore, usePersistReady } from "@/lib/state/stores";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const analyses = useDossierStore((s) => s.analyses);
  const journey = useJourneyStore((s) => s.response);
  const ready = usePersistReady();

  const q = query.trim().toLowerCase();

  const pieces = useMemo(
    () =>
      Object.entries(analyses).filter(([, a]) =>
        (a.fileName ?? a.requirementId).toLowerCase().includes(q)
      ),
    [analyses, q]
  );
  const requirements = useMemo(
    () =>
      (journey?.documents ?? []).filter(
        (r) => r.name.toLowerCase().includes(q) || r.requirementId.toLowerCase().includes(q)
      ),
    [journey, q]
  );

  const empty =
    ready && q.length > 0
      ? pieces.length === 0 && requirements.length === 0
      : ready && !journey && Object.keys(analyses).length === 0;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Recherche</h1>
        <p className="mt-1 text-sm text-text2">Dans vos pièces, votre parcours et vos fichiers.</p>
      </div>

      <SearchInput
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Rechercher une pièce, une démarche…"
        autoFocus
      />

      {ready && empty ? (
        <EmptyState
          emoji={<SearchIcon className="h-9 w-9" />}
          title={q ? "Aucun résultat" : "Rien à chercher pour l'instant"}
          description={
            q
              ? `Rien ne correspond à « ${query.trim()} » dans votre session.`
              : "Votre parcours et vos pièces apparaîtront ici dès que vous aurez commencé une démarche."
          }
          action={
            !q && !journey ? (
              <Link href="/app/home" className="focus-visible">
                <Badge tone="info" className="px-4 py-2 text-sm">
                  Décrire ma démarche
                </Badge>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          {q ? (
            <h2 className="text-sm font-semibold uppercase tracking-widest text-text-muted">
              Résultats
            </h2>
          ) : null}

          {requirements.length > 0 ? (
            <div className="flex flex-col gap-2">
              {requirements.map((r) => (
                <Card key={`req-${r.requirementId}`} className="p-2">
                  <ListItem
                    icon={<HomeIcon className="h-5 w-5" />}
                    title={r.name}
                    description={requirementLabel(r.requirementId)}
                    trailing={<Badge tone="neutral">{documentStatusLabel(r.status)}</Badge>}
                    href={journey ? `/app/dossier/${journey.journeyId}` : `/app/evidence/${encodeURIComponent(r.requirementId)}`}
                  />
                </Card>
              ))}
            </div>
          ) : null}

          {pieces.length > 0 ? (
            <div className="flex flex-col gap-2">
              {pieces.map(([requirementId, a]) => (
                <Card key={`piece-${requirementId}`} className="p-2">
                  <ListItem
                    icon={<FileIcon className="h-5 w-5" />}
                    title={a.fileName ?? requirementLabel(requirementId)}
                    description={requirementLabel(requirementId)}
                    href={`/app/memory/${encodeURIComponent(requirementId)}`}
                  />
                </Card>
              ))}
            </div>
          ) : null}

          {q.length === 0 && ready && !journey && Object.keys(analyses).length === 0 ? (
            <p className="flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-text-muted">
              <SearchIcon className="h-4 w-4" /> Saisissez un mot pour chercher dans votre session.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}