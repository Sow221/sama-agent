/**
 * AppSystemUI — états système (§44-46, §81, §109).
 * 1. Recherche globale Cmd/Ctrl+K (desktop, Blueprint §81) — résultats RÉELS
 *    (parcours · pièces · souvenirs), navigation honnête, jamais de fonctions.
 * 2. Bannière offline + toast de retour en ligne (événements navigator réels).
 * 3. Modal « Session expirée » sur 401 (événement `sama:unauthorized` émis par
 *    l'API client quand Supabase revoie 401).
 * Monté dans AppShell : aucun faux état, tout provient de sources réelles.
 */
"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Card, OfflineBanner, SearchInput } from "@/components/ui";
import { Modal, useToast } from "@/components/ui/overlays";
import { FileIcon, MemoryIcon, UserIcon } from "@/components/icons";
import { useDossierStore, useJourneyStore } from "@/lib/state/stores";
import { useMemories } from "@/lib/query/conversations";
import { procedureLabel, requirementLabel } from "@/lib/labels";

interface Result {
  key: string;
  kind: "journey" | "piece" | "souvenir";
  title: string;
  subtitle?: string;
  href: string;
}

export function AppSystemUI() {
  const router = useRouter();
  const toast = useToast();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [offline, setOffline] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  const journey = useJourneyStore((s) => s.response);
  const analyses = useDossierStore((s) => s.analyses);
  const memoryItems = useMemories().data ?? [];

  /* Cmd/Ctrl+K → recherche globale (§81) */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        // Recherche dédiée pleine page sur mobile (BottomNav), overlay sur desktop.
        if (window.matchMedia("(min-width: 768px)").matches) {
          setSearchOpen((open) => !open);
        } else {
          router.push("/app/search");
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  /* Événements réseau réels → bannière + toast (§45-46) */
  useEffect(() => {
    const on = () => {
      setOffline(false);
      toast.toast({ title: "De retour en ligne.", tone: "success" });
    };
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    setOffline(!navigator.onLine);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* 401 → session expirée (§44) */
  useEffect(() => {
    const on401 = () => setSessionExpired(true);
    window.addEventListener("sama:unauthorized", on401);
    return () => window.removeEventListener("sama:unauthorized", on401);
  }, []);

  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out: Result[] = [];
    if (journey && procedureLabel(journey.procedureId).toLowerCase().includes(q)) {
      out.push({
        key: "journey",
        kind: "journey",
        title: procedureLabel(journey.procedureId),
        subtitle: "Parcours en cours",
        href: `/app/journey/${journey.journeyId}`,
      });
    }
    for (const [requirementId, a] of Object.entries(analyses)) {
      const name = (a.fileName ?? requirementId).toLowerCase();
      if (name.includes(q) || requirementLabel(requirementId).toLowerCase().includes(q)) {
        out.push({
          key: `piece-${requirementId}`,
          kind: "piece",
          title: a.fileName ?? requirementLabel(requirementId),
          subtitle: requirementLabel(requirementId),
          href: `/app/memory/${encodeURIComponent(requirementId)}`,
        });
      }
    }
    for (const item of memoryItems) {
      if (item.content.toLowerCase().includes(q)) {
        out.push({
          key: item.id,
          kind: "souvenir",
          title: item.content,
          subtitle: "Souvenir mémorisé",
          href: "/app/memory?tab=souvenirs",
        });
      }
    }
    return out.slice(0, 8);
  }, [query, journey, analyses, memoryItems]);

  const icons: Record<Result["kind"], ReactNode> = {
    journey: <UserIcon className="h-4 w-4" />,
    piece: <FileIcon className="h-4 w-4" />,
    souvenir: <MemoryIcon className="h-4 w-4" />,
  };

  const firstHref = results[0]?.href;

  return (
    <>
      {offline ? (
        <div className="fixed inset-x-0 top-0 z-header">
          <OfflineBanner text="Vous êtes hors ligne — Sama Agent continue en local." />
        </div>
      ) : null}

      {/* Overlay de recherche desktop (§81) */}
      {searchOpen ? (
        <div className="fixed inset-0 z-modal flex items-start justify-center px-4 pt-[10vh]">
          <div
            aria-hidden
            onClick={() => setSearchOpen(false)}
            className="absolute inset-0 bg-black/55 backdrop-blur-sm"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Recherche globale"
            className="relative z-10 w-full max-w-[640px] overflow-hidden rounded-2xl border border-border bg-surface-elevated shadow-elevated backdrop-blur-xl motion-safe:animate-[fadeUp_0.3s_var(--ease-out)]"
          >
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <SearchInput
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && firstHref) {
                    e.preventDefault();
                    setSearchOpen(false);
                    router.push(firstHref);
                  }
                  if (e.key === "Escape") setSearchOpen(false);
                }}
                placeholder="Rechercher (parcours, pièces, souvenirs)…"
                className="flex-1"
              />
            </div>
            <div className="max-h-[50vh] overflow-y-auto p-2">
              {query.trim() && results.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-text-muted">
                  Aucun résultat pour « {query.trim()} ».
                </p>
              ) : results.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-text-muted">
                  Recherchez parmi vos parcours, pièces et souvenirs réels.
                </p>
              ) : (
                <div className="flex flex-col gap-1">
                  {results.map((r) => (
                    <button
                      key={r.key}
                      type="button"
                      onClick={() => {
                        setSearchOpen(false);
                        router.push(r.href);
                      }}
                      className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-left transition-colors hover:bg-surface-hover"
                    >
                      <span className="text-text-muted">{icons[r.kind]}</span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-text1">{r.title}</span>
                        {r.subtitle ? (
                          <span className="block truncate text-xs text-text-muted">{r.subtitle}</span>
                        ) : null}
                      </span>
                      <span className="ml-auto text-xs text-text-muted">↵</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="border-t border-border px-4 py-2 text-center text-xs text-text-muted">
              Échap pour fermer
            </div>
          </div>
        </div>
      ) : null}

      {/* Session expirée (§44) */}
      <Modal
        open={sessionExpired}
        onClose={() => setSessionExpired(false)}
        title="Session expirée"
        description="Votre session a pris fin. Reconnectez-vous pour continuer — votre dossier reste enregistré."
        footer={
          <>
            <Button variant="ghost" onClick={() => setSessionExpired(false)}>
              Rester déconnecté
            </Button>
            <Link href="/login" className="focus-visible">
              <Button>Se connecter</Button>
            </Link>
          </>
        }
      >
        <Card className="border-accent-ai/20 bg-accent-soft">
          <p className="text-sm text-text2">
            Aucune donnée n'est perdue : pièces, parcours et souvenirs sont conservés.
          </p>
        </Card>
      </Modal>
    </>
  );
}