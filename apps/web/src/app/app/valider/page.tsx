"use client";

/**
 * Valider — `/app/valider` : l'étalon wolophone de l'usine à données (doc 11 §5).
 *
 * Une carte à la fois : la phrase wolof, son audio (voix Adia), ce que l'oreille
 * (Kiriku) en a réentendu. Un geste suffit :
 *   → glisser à droite / ✅ : wolof naturel     ← glisser à gauche / ❌ : à rejeter
 *   ✏️ : corriger un mot (la correction devient la donnée la plus précieuse)
 * Les verdicts calibrent les filtres automatiques : on ne leur fait confiance en
 * volume que s'ils sont d'accord avec l'étalon au moins 9 fois sur 10.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card, EmptyState, ErrorNotice, SkeletonCard, Textarea } from "@/components/ui";
import { CheckIcon, CloseIcon, EditIcon, VolumeIcon } from "@/components/icons";
import { api, ApiError, type DataItem, type DataStats } from "@/lib/api-client/client";

const DAILY_GOAL = 30;
const SWIPE_THRESHOLD = 96;

type Verdict = "ok" | "ko" | "edit";

function todayKey() {
  return `sama:valider:${new Date().toISOString().slice(0, 10)}`;
}

function readToday(): number {
  try {
    return Number(localStorage.getItem(todayKey()) ?? 0) || 0;
  } catch {
    return 0;
  }
}

function pct(v: number | null) {
  return v === null ? "—" : `${Math.round(v * 100)} %`;
}

/** Ce que les contrôles automatiques disent de l'élément (K1 aujourd'hui). */
function k1Of(item: DataItem): { heard: string; wer: number; passed: boolean } | null {
  const k1 = item.checks.K1 as { heard?: string; wer?: number; passed?: boolean } | undefined;
  if (!k1 || typeof k1.wer !== "number") return null;
  return { heard: k1.heard ?? "", wer: k1.wer, passed: Boolean(k1.passed) };
}

export default function ValiderPage() {
  const [queue, setQueue] = useState<DataItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [forbidden, setForbidden] = useState(false);
  const [stats, setStats] = useState<DataStats | null>(null);
  const [done, setDone] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [dx, setDx] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const drag = useRef<{ x: number; id: number } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const current = queue[0];

  const refreshStats = useCallback(() => {
    api.datafactoryStats().then((s) => setStats(s.me)).catch(() => {});
  }, []);

  const loadMore = useCallback(async () => {
    try {
      const items = await api.datafactoryNext(10);
      setQueue((q) => {
        const seen = new Set(q.map((i) => i.id));
        return [...q, ...items.filter((i) => !seen.has(i.id))];
      });
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) setForbidden(true);
      else setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setDone(readToday());
    void loadMore();
    refreshStats();
  }, [loadMore, refreshStats]);

  // Audio de la carte courante (protégé → récupéré avec le jeton, puis lu localement).
  useEffect(() => {
    let revoked: string | null = null;
    setAudioUrl(null);
    if (current?.hasAudio) {
      api
        .datafactoryAudio(current.id)
        .then((url) => {
          revoked = url;
          setAudioUrl(url);
        })
        .catch(() => setAudioUrl(null));
    }
    return () => {
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [current?.id, current?.hasAudio]);

  const judge = useCallback(
    async (verdict: Verdict, correction?: string) => {
      if (!current || sending) return;
      setSending(true);
      try {
        await api.datafactoryVerdict({ itemId: current.id, verdict, correction });
        const next = readToday() + 1;
        try {
          localStorage.setItem(todayKey(), String(next));
        } catch {
          /* compteur facultatif */
        }
        setDone(next);
        setQueue((q) => q.slice(1));
        setEditing(false);
        setDx(0);
        if (queue.length <= 3) void loadMore();
        refreshStats();
      } catch (err) {
        setError(err);
        setDx(0);
      } finally {
        setSending(false);
      }
    },
    [current, sending, queue.length, loadMore, refreshStats]
  );

  // Raccourcis clavier (ordinateur) : → naturel, ← rejeter, E corriger.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (editing || !current) return;
      if (e.key === "ArrowRight") void judge("ok");
      if (e.key === "ArrowLeft") void judge("ko");
      if (e.key.toLowerCase() === "e") {
        setDraft(current.textWo);
        setEditing(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, current, judge]);

  function onPointerDown(e: React.PointerEvent) {
    if (editing) return;
    drag.current = { x: e.clientX, id: e.pointerId };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (drag.current?.id === e.pointerId) setDx(e.clientX - drag.current.x);
  }
  function onPointerUp() {
    if (!drag.current) return;
    drag.current = null;
    if (dx > SWIPE_THRESHOLD) void judge("ok");
    else if (dx < -SWIPE_THRESHOLD) void judge("ko");
    else setDx(0);
  }

  if (forbidden) {
    return (
      <EmptyState
        title="Espace réservé aux étalons"
        description="Cet écran sert à valider le wolof de l'usine à données. Demandez à être ajouté à la liste des étalons (SAMA_VALIDATORS)."
      />
    );
  }

  const k1 = current ? k1Of(current) : null;
  const tilt = Math.max(-12, Math.min(12, dx / 12));

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5">
      <header className="flex flex-col gap-2">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Valider le wolof</h1>
          <p className="mt-1 text-sm text-text2">
            Aujourd&apos;hui : <strong className="text-text1">{done}</strong> / {DAILY_GOAL}
          </p>
        </div>
        {stats ? (
          <div className="flex flex-wrap gap-2 text-xs text-text2" aria-live="polite">
            <span className="rounded-full bg-surface-2 px-3 py-1">
              Accord : <strong className="text-text1">{pct(stats.agreement)}</strong>
            </span>
            <span className="rounded-full bg-surface-2 px-3 py-1">
              Précision des filtres : <strong className="text-text1">{pct(stats.precision)}</strong>
            </span>
            <span
              className={`rounded-full px-3 py-1 ${stats.trusted ? "bg-success/15 font-semibold text-success" : "bg-surface-2"}`}
            >
              {stats.trusted ? "Filtres fiables ✓" : `${stats.judged} jugés · 90 % visés sur 50+`}
            </span>
          </div>
        ) : null}
      </header>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-elevated" aria-hidden>
        <div
          className="h-full rounded-full bg-primary transition-all duration-ui"
          style={{ width: `${Math.min(100, (done / DAILY_GOAL) * 100)}%` }}
        />
      </div>

      {error ? <ErrorNotice error={error} action="L'usine à données" onRetry={() => void loadMore()} /> : null}

      {loading ? (
        <SkeletonCard lines={4} />
      ) : !current ? (
        <EmptyState
          title="Rien à valider pour l'instant"
          description="Tous les exemples ont été jugés. Lancez un nouveau lot sur la machine GPU (run_k1) puis revenez."
          action={
            <Button variant="secondary" onClick={() => void loadMore()}>
              Rafraîchir
            </Button>
          }
        />
      ) : (
        <>
          <div
            role="group"
            aria-label="Exemple à valider"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className="touch-pan-y select-none"
            style={{
              transform: `translateX(${dx}px) rotate(${tilt}deg)`,
              transition: drag.current ? "none" : "transform 220ms cubic-bezier(.2,.8,.2,1)",
            }}
          >
            <Card
              className={`relative flex min-h-[18rem] flex-col gap-4 p-6 ${
                dx > SWIPE_THRESHOLD / 2 ? "ring-2 ring-success" : dx < -SWIPE_THRESHOLD / 2 ? "ring-2 ring-error" : ""
              }`}
            >
              <div className="flex items-center justify-between text-xs text-text-muted">
                <span>{current.kind === "AUDIO_TEXT" ? "Audio + texte" : "Traduction"}</span>
                <span>{current.source}</span>
              </div>

              {editing ? (
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={4}
                  lang="wo"
                  aria-label="Correction en wolof"
                  autoFocus
                />
              ) : (
                <p lang="wo" className="text-2xl font-bold leading-snug">
                  {current.textWo}
                </p>
              )}

              {current.textFr ? <p className="text-sm text-text2">FR : {current.textFr}</p> : null}

              {current.hasAudio ? (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void audioRef.current?.play()}
                    disabled={!audioUrl}
                    className="focus-visible flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent-ai disabled:opacity-50"
                    aria-label="Écouter la voix"
                  >
                    <VolumeIcon className="h-6 w-6" />
                  </button>
                  <span className="text-sm text-text2">{audioUrl ? "Écouter la voix (Adia)" : "Chargement de l'audio…"}</span>
                  {audioUrl ? <audio ref={audioRef} src={audioUrl} preload="auto" /> : null}
                </div>
              ) : null}

              {k1 ? (
                <div className="rounded-xl bg-surface-2 p-3 text-sm">
                  <p className="text-text2">
                    L&apos;oreille a réentendu :{" "}
                    <span lang="wo" className="text-text1">
                      « {k1.heard || "…"} »
                    </span>
                  </p>
                  <p className={`mt-1 text-xs font-semibold ${k1.passed ? "text-success" : "text-error"}`}>
                    Contrôle K1 {k1.passed ? "réussi" : "échoué"} · erreurs {Math.round(k1.wer * 100)} %
                  </p>
                </div>
              ) : null}
            </Card>
          </div>

          {editing ? (
            <div className="grid grid-cols-2 gap-3">
              <Button variant="ghost" size="lg" onClick={() => setEditing(false)}>
                Annuler
              </Button>
              <Button
                variant="gradient"
                size="lg"
                loading={sending}
                disabled={!draft.trim() || draft.trim() === current.textWo.trim()}
                onClick={() => void judge("edit", draft)}
              >
                Enregistrer
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-3 items-center gap-3">
              <button
                type="button"
                onClick={() => void judge("ko")}
                disabled={sending}
                aria-label="Rejeter (glisser à gauche)"
                className="focus-visible mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-error/40 bg-error/10 text-error transition-transform active:scale-95 disabled:opacity-50"
              >
                <CloseIcon className="h-8 w-8" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraft(current.textWo);
                  setEditing(true);
                }}
                disabled={sending}
                aria-label="Corriger un mot"
                className="focus-visible mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-border bg-surface text-text1 transition-transform active:scale-95 disabled:opacity-50"
              >
                <EditIcon className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => void judge("ok")}
                disabled={sending}
                aria-label="Wolof naturel (glisser à droite)"
                className="focus-visible mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success text-[#11110f] transition-transform active:scale-95 disabled:opacity-50"
              >
                <CheckIcon className="h-8 w-8" />
              </button>
            </div>
          )}
          <p className="text-center text-xs text-text-muted">
            Glissez à droite si le wolof est naturel, à gauche pour le rejeter. Au clavier : → · ← · E.
          </p>
        </>
      )}
    </div>
  );
}
