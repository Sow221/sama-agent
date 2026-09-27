"use client";

/**
 * Conversation — `/app/chats/[conversationId]`.
 *
 * Tout est réel et serveur :
 *   - la conversation et son historique (GET /api/conversations/:id[/messages]) ;
 *   - chaque réponse vient d'un tour d'agent (POST /api/agent/turn) : intention,
 *     état du dossier calculé par le moteur, mémoire de l'usager — et les deux
 *     messages sont persistés par le serveur ;
 *   - « Mémoriser » écrit dans la mémoire serveur (POST /api/memory), que l'agent
 *     relit au tour suivant.
 * Avant : réponse fixe construite côté client, historique en session, mémoire
 * locale que l'agent ne voyait jamais.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { JOURNEY_STATUS_LABEL, type JOURNEY_STATUS } from "@sama/shared/gen/enums";
import {
  Button,
  Card,
  EmptyState,
  ErrorNotice,
  Progress,
  SkeletonCard,
  Textarea,
  ThinkingDots,
} from "@/components/ui";
import { Modal, useToast } from "@/components/ui/overlays";
import { ArrowRightIcon, ChatIcon, SendIcon } from "@/components/icons";
import { useJourneyResume } from "@/lib/query/hooks";
import {
  MEMORY_KIND_LABEL,
  useAgentTurn,
  useConversation,
  useCreateMemory,
  useMessages,
} from "@/lib/query/conversations";
import { procedureLabel } from "@/lib/labels";
import type { MemoryKind } from "@/lib/schemas";

const SAVE_KINDS: MemoryKind[] = ["SELF", "PREFERENCE", "FACT"];

export default function ConversationPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const router = useRouter();
  const toast = useToast();
  const [text, setText] = useState("");
  const [lastSent, setLastSent] = useState<string | null>(null);
  const [proposal, setProposal] = useState<string | null>(null);
  const [kind, setKind] = useState<MemoryKind>("FACT");
  const endRef = useRef<HTMLDivElement>(null);

  const conversation = useConversation(conversationId);
  const journeyId = conversation.data?.journeyId ?? undefined;
  const journey = useJourneyResume(journeyId, Boolean(journeyId)).data;
  const messages = useMessages(conversation.data ? conversationId : undefined);
  const turn = useAgentTurn(conversationId);
  const saveMemory = useCreateMemory();

  const canSend = useMemo(() => text.trim().length > 0 && !turn.isPending, [text, turn.isPending]);

  // `?q=` : question transmise par l'écran Comprendre → envoyée UNE fois, à l'ouverture.
  const searchParams = useSearchParams();
  const initialQuestion = searchParams.get("q");
  const askedRef = useRef(false);
  useEffect(() => {
    if (!initialQuestion || askedRef.current || !conversation.data || messages.isLoading) return;
    askedRef.current = true;
    router.replace(`/app/chats/${conversationId}`);
    if (!messages.data?.length) send(initialQuestion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuestion, conversation.data, messages.isLoading]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.data?.length, turn.isPending]);

  function send(content = text.trim()) {
    if (!content || turn.isPending) return;
    setLastSent(content);
    turn.mutate(
      { text: content, journeyId },
      {
        onSuccess: (r) => {
          if (r.newMemories.length) {
            toast.toast({
              title: "Mémorisé",
              description: r.newMemories.map((m) => m.content).join(" · "),
              tone: "success",
            });
          }
        },
      }
    );
    setText("");
  }

  async function copyMessage(t: string) {
    try {
      await navigator.clipboard.writeText(t);
      toast.toast({ title: "Message copié.", tone: "neutral" });
    } catch {
      toast.toast({ title: "Copie impossible.", tone: "error" });
    }
  }

  async function confirmMemory() {
    if (!proposal) return;
    await saveMemory.mutateAsync({ kind, content: proposal, source: "chat", journeyId });
    toast.toast({ title: "Ajouté à votre mémoire.", tone: "success" });
    setProposal(null);
  }

  if (conversation.isLoading) return <SkeletonCard lines={4} />;

  // Seulement si RIEN n'est chargé : un rechargement raté (retour sur l'onglet,
  // tunnel lent) ne doit pas remplacer la conversation affichée ni sa zone de saisie.
  if (!conversation.data) {
    return (
      <EmptyState
        emoji={<ChatIcon className="h-9 w-9" />}
        title="Conversation introuvable"
        description="Elle a peut-être été supprimée. Retrouvez vos échanges dans Chats."
        action={
          <Button variant="gradient" size="lg" onClick={() => router.push("/app/chats")}>
            Voir mes conversations
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="truncate text-2xl font-extrabold tracking-tight">
          {conversation.data.title || "Conversation"}
        </h1>
        <p className="mt-1 text-sm text-text2">
          L'agent répond à partir de l'état réel de votre dossier et de ce que vous lui avez confié.
        </p>
      </div>

      {/* Contexte : le dossier lié (données serveur) */}
      {journey ? (
        <Card>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-widest text-primary">Dossier lié</p>
              <p className="mt-1 truncate font-bold">{procedureLabel(journey.procedureId)}</p>
            </div>
            <span className="shrink-0 rounded-full border border-accent-ai/30 bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-ai">
              {JOURNEY_STATUS_LABEL[journey.status as JOURNEY_STATUS]}
            </span>
          </div>
          <div className="mt-3">
            <Progress value={journey.completion.ratio} label="Progression du dossier" />
            <p className="mt-1 text-xs text-text-muted">
              {journey.completion.provided}/{journey.completion.required} pièces analysées
              {journey.nextActionLabel ? ` · Prochaine action : ${journey.nextActionLabel}` : ""}
            </p>
          </div>
          <Link
            href={`/app/journey/${journey.journeyId}`}
            className="focus-visible mt-3 inline-flex items-center gap-1 text-sm font-semibold text-accent-ai"
          >
            Ouvrir le parcours <ArrowRightIcon className="h-4 w-4" />
          </Link>
        </Card>
      ) : null}

      {/* Historique (serveur) */}
      <div className="flex flex-col gap-3" aria-live="polite">
        {messages.isLoading ? <ThinkingDots label="Chargement de l'historique…" /> : null}
        {!messages.isLoading && !messages.data?.length && !turn.isPending ? (
          <p className="text-center text-sm text-text-muted">
            Posez votre question : « Qu'est-ce qu'il me manque ? », « Où déposer mon dossier ? »…
          </p>
        ) : null}
        {messages.data?.map((m) => (
          <div key={m.id} className="flex flex-col gap-1.5">
            <div
              className={
                m.role === "user"
                  ? "max-w-[85%] self-end whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-4 py-3 text-base text-[#11110f]"
                  : "max-w-[85%] self-start whitespace-pre-wrap rounded-2xl rounded-bl-md border border-border bg-surface px-4 py-3 text-base text-text1"
              }
            >
              <Linkified text={m.content} />
            </div>
            {m.role === "assistant" ? (
              <div className="flex items-center gap-1 self-start pl-1">
                <button
                  type="button"
                  onClick={() => copyMessage(m.content)}
                  className="focus-visible min-h-11 rounded-full px-3 text-sm font-medium text-text-muted transition-colors hover:bg-surface-hover hover:text-text1"
                >
                  Copier
                </button>
                <button
                  type="button"
                  onClick={() => setProposal(m.content)}
                  className="focus-visible min-h-11 rounded-full px-3 text-sm font-medium text-text-muted transition-colors hover:bg-surface-hover hover:text-text1"
                >
                  Mémoriser
                </button>
              </div>
            ) : null}
          </div>
        ))}
        {turn.isPending ? (
          <>
            {lastSent ? (
              <div className="max-w-[85%] self-end whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary/70 px-4 py-3 text-base text-[#11110f]">
                {lastSent}
              </div>
            ) : null}
            <div className="self-start rounded-2xl rounded-bl-md border border-border bg-surface px-4 py-3">
              <ThinkingDots label="L'agent réfléchit…" />
            </div>
          </>
        ) : null}
        {turn.isError ? (
          <ErrorNotice
            error={turn.error}
            action="La réponse de l'agent"
            onRetry={lastSent ? () => send(lastSent) : undefined}
          />
        ) : null}
        <div ref={endRef} />
      </div>

      {/* Composer — fond OPAQUE : les messages ne défilent jamais « à travers ».
          Mobile : collé au-dessus de la barre d'onglets (encoche iPhone comprise). */}
      <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-10 -mx-4 bg-bg px-4 pb-2 pt-2 sm:-mx-6 sm:px-6 md:bottom-0 md:mx-0 md:px-0 md:pb-4">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-6 h-6 bg-gradient-to-t from-bg to-transparent" />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="relative flex items-end gap-2 rounded-2xl border border-border bg-surface-elevated p-2 shadow-elevated"
        >
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder="Écrivez votre message…"
            aria-label="Votre message"
            className="max-h-40 border-0 bg-transparent focus:ring-0"
          />
          <button
            type="submit"
            aria-label="Envoyer"
            disabled={!canSend}
            className="focus-visible flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent-ai text-[#11110f] transition-transform duration-micro active:scale-[0.95] disabled:opacity-40"
          >
            <SendIcon className="h-5 w-5" />
          </button>
        </form>
      </div>

      <Modal
        open={Boolean(proposal)}
        onClose={() => setProposal(null)}
        title="Mémoriser cette information ?"
        description="L'agent s'en servira dans vos prochains échanges. Vous pouvez l'oublier à tout moment depuis Mémoire."
        footer={
          <>
            <Button variant="ghost" onClick={() => setProposal(null)}>Pas maintenant</Button>
            <Button onClick={confirmMemory} loading={saveMemory.isPending}>Mémoriser</Button>
          </>
        }
      >
        <p className="line-clamp-3 text-sm text-text2">{proposal}</p>
        <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Type de mémoire">
          {SAVE_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => setKind(k)}
              className={
                kind === k
                  ? "focus-visible min-h-11 rounded-full bg-primary px-4 text-sm font-semibold text-[#11110f]"
                  : "focus-visible min-h-11 rounded-full border border-border bg-surface px-4 text-sm font-semibold text-text2 hover:bg-surface-hover"
              }
            >
              {MEMORY_KIND_LABEL[k]}
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}

/** Rend cliquables les liens (sources web) d'un message, sans HTML injecté. */
function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s)\]]+)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all font-semibold underline underline-offset-2"
          >
            {part}
          </a>
        ) : (
          part
        )
      )}
    </>
  );
}
