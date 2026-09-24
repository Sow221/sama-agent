"use client";

/**
 * Écran 5 — Preuve (G7) : pour un élément du dossier.
 *  - Affiche la preuve officielle du service (GET /api/evidence/:requirement)
 *  - Permet de fournir le document : fichier réel envoyé → analyse par la VRAIE
 *    chaîne de vision (POST /api/documents/analyze). Aucun résultat pré-réglé.
 */
import { useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Card, Spinner } from "@/components/ui";
import { EvidencePanel } from "@/components/journey/EvidencePanel";
import { useEvidence, useAnalyzeMutation } from "@/lib/query/hooks";
import { useDossierStore } from "@/lib/state/stores";

export default function PreuvePage() {
  const params = useParams<{ requirement: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const requirement = decodeURIComponent(params.requirement);
  const journeyId = searchParams.get("journey") ?? "driving_license_new";

  const [file, setFile] = useState<File | null>(null);
  const evidence = useEvidence(requirement);
  const setAnalysis = useDossierStore((s) => s.setAnalysis);

  const analyze = useAnalyzeMutation();

  const result = useDossierStore((s) => s.analyses[requirement]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    form.append("requirementId", requirement);
    form.append("journeyId", journeyId);
    const analysis = await analyze.mutateAsync(form);
    setAnalysis(requirement, analysis);
  }

  return (
    <section className="flex flex-col gap-6 pt-4">
      <div>
        <Link href={`/dossier/${journeyId}`} className="text-sm text-accent-ai">
          ‹ Mon dossier
        </Link>
        <h1 className="mt-2 text-2xl font-bold capitalize">{requirement}</h1>
      </div>

      {evidence.isLoading ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : evidence.data ? (
        <EvidencePanel evidence={evidence.data} />
      ) : null}

      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <label className="block">
          <span className="text-sm font-semibold">Fournir le document</span>
          <input
            type="file"
            accept="image/*,.pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="focus-visible mt-2 block w-full rounded-card bg-surface border border-surface-2 p-4 text-sm text-text1 file:mr-3 file:rounded-full file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[#04211a]"
          />
        </label>
        <Button type="submit" disabled={!file || analyze.isPending}>
          {analyze.isPending ? <Spinner /> : "Analyser le document"}
        </Button>
        {analyze.isError ? (
          <p role="alert" className="text-sm text-danger">
            L'analyse a échoué : le fichier n'a pas pu être traité. Réessayez.
          </p>
        ) : null}
      </form>

      {result ? (
        <Card>
          <p className="font-semibold">
            Résultat de l'analyse {result.status === "ANALYZED" ? "✓ conforme" : `— ${result.status}`}
          </p>
          {result.reason ? <p className="mt-1 text-sm text-text2">{result.reason}</p> : null}
          <Button
            className="mt-3 w-full"
            variant="ghost"
            onClick={() => router.push(`/dossier/${journeyId}`)}
          >
            Retourner au dossier
          </Button>
        </Card>
      ) : null}
    </section>
  );
}