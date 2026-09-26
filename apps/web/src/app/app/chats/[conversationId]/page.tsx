"use client";

/**
 * Conversation — `/app/chats/[conversationId]` (UI/UX Master Spec §16-17, §34, §113).
 * Workspace : en-tête + messages + composer (texte réel → intent avec contexte dossier).
 * L'état du parcours vient du SERVEUR (reprise par dossier, référence §7.3) : étapes,
 * progression, prochaine action — jamais reconstruit depuis le navigateur.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Button, Card, EmptyState, Progress, SkeletonCard, Textarea } from "@/components/ui";
import { useToast } from "@/components/ui/overlays";
import { ArrowRightIcon, SendIcon } from "@/components/icons";
import { useIntentMutation, useJourneyResume } from "@/lib/query/hooks";
import { useChatStore } from "@/lib/state/stores";
import {
  MEMORY_CATEGORY_LABEL,
  useMemoryStore,
  type MemoryCategory,
} from "@/lib/state/memory";

const MEMORY_CATEGORIES: MemoryCategory[] = ["you", "projects", "goals", "preferences", "important"];

export default function ConversationPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const router = useRouter();
  const [text, setText] = useState("");
  const [proposal, setProposal] = useState<string | null>(null);
  const [category, setCategory] = useState<MemoryCategory>("important");
  const messages = useChatStore((s) => s.messages);
  const addMessage = useChatStore((s) => s.addMessage);
  const addMemory = useMemoryStore((s) => s.add);
  const toast = useToast();

  const resume = useJourneyResume(conversationId, true);
  const journey = resume.data;

  const intent = useIntentMutation((r) => {
    const reply =
      r.clarificationQuestion ??
      (r.needsClarification
        ? "J'ai besoin d'un détail pour comprendre votre demande."
        : r.transcript
          ? `Votre demande est comprise (confiance ${Math.round((r.confidence ?? 0) * 100)}%).`
          : "Votre demande est comprise.");
    addMessage({ role: "agent", text: reply });
  });

  const canSend = useMemo(() => text.trim().length > 0 && !intent.isPending, [text, intent.isPending]);

  function send() {
    if (!canSend) return;
    addMessage({ role: "user", text: text.trim() });
    intent.mutate({ transcript: text.trim(), language: "fr", context: { journeyId: conversationId } });
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

  function saveProposal() {
    if (!proposal) return;
    addMemory(proposal, category);
    toast.toast({ title: "Mémorisé dans la mémoire.", tone: "success" });
    setProposal(null);
  }

  if (resume.isLoading) {
    return <SkeletonCard lines={4} />;
  }

  if (resume.isError || !journey) {
    return (
      <EmptyState
        emoji="🗂️"
        title="Parcours introuvable"
        description="Ce dossier n'existe pas encore sur le serveur. Commencez une nouvelle conversation pour créer votre parcours."
        action={
          <Button variant="gradient" size="lg" onClick={() => router.push("/app/home")}>
            Nouvelle conversation
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Résumé du parcours (données serveur) */}
      <Card>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase tracking-widest text-primary">
              Parcours en cours
            </p>
            <h1 className="mt-1 truncate text-xl font-extrabold">{journey.procedureId}</h1>
          </div>
          <span className="shrink-0 rounded-full border border-accent-ai/30 bg-accent-soft px-3 py-1 text-sm font-semibold text-accent-ai">
            {Math.round(journey.completion.ratio * 100)}%
          </span>
        </div>

        <div className="mt-4">
          <Progress value={journey.completion.ratio} label="Progression du parcours" />
          <p className="mt-1 text-xs text-text-muted">
            {journey.completion.provided}/{journey.completion.required} pièces fournies
          </p>
        </div>

        {journey.nextActionLabel ? (
          <div className="mt-4 rounded-lg border border-primary-soft bg-primary/10 p-3">
            <p className="text-sm font-semibold text-primary">Action suivante</p>
            <p className="mt-0.5 text-sm text-text1">{journey.nextActionLabel}</p>
            {journey.nextActionReason ? (
              <p className="mt-0.5 text-xs text-text2">{journey.nextActionReason}</p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Link href={`/app/journey/${journey.journeyId}`} className="flex-1 focus-visible">
            <Button variant="secondary" className="w-full">
              Parcours détaillé
              <ArrowRightIcon className="h-4 w-4" />
            </Button>
          </Link>
          <Link href={`/app/dossier/${journey.journeyId}`} className="flex-1 focus-visible">
            <Button variant="ghost" className="w-full">
              Pièces du dossier
            </Button>
          </Link>
        </div>

        {/* Étapes réelles du moteur */}
        <ol className="mt-4 flex flex-col gap-2">
          {journey.steps.map((s) => (
            <li key={s.id} className="flex items-center gap-3 text-sm">
              <span
                aria-hidden
                className={
                  s.status === "done"
                    ? "text-success"
                    : s.status === "active"
                      ? "text-primary"
                      : "text-text-disabled"
                }
              >
                {s.status === "done" ? "✓" : s.status === "active" ? "●" : "○"}
              </span>
              <span className={s.status === "todo" ? "text-text-muted" : "text-text1"}>{s.name}</span>
            </li>
          ))}
        </ol>
      </Card>

      {/* Messages (conversation textuelle réelle de session) */}
      {messages.length > 0 ? (
        <div className="flex flex-col gap-3" aria-live="polite">
          {messages.map((m) => (
            <div key={m.id} className="flex flex-col gap-1.5">
              <div
                className={
                  m.role === "user"
                    ? "self-end max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-3 text-base text-[#04211a]"
                    : "self-start max-w-[85%] rounded-2xl rounded-bl-md border border-border bg-surface px-4 py-3 text-base text-text1"
                }
              >
                {m.text}
              </div>
              {/* Actions de message (§24-26) : uniquement sur les réponses agent */}
              {m.role === "agent" ? (
                <div className="flex items-center gap-1 self-start pl-1">
                  <button
                    type="button"
                    onClick={() => copyMessage(m.text)}
                    className="min-h-11 rounded-full px-3 text-sm font-medium text-text-muted transition-colors hover:bg-surface-hover hover:text-text1"
                  >
                    Copier
                  </button>
                  <button
                    type="button"
                    onClick={() => setProposal(m.text)}
                    className="min-h-11 rounded-full px-3 text-sm font-medium text-text-muted transition-colors hover:bg-surface-hover hover:text-text1"
                  >
                    Mémoriser
                  </button>
                </div>
              ) : null}
            </div>
          ))}
          {intent.isPending ? (
            <div className="self-start rounded-2xl rounded-bl-md border border-border bg-surface px-4 py-3 text-base text-text2">
              J'analyse…
            </div>
          ) : null}
          {intent.isError ? (
            <p role="alert" className="text-sm text-error">
              L'analyse a échoué. Réessayez.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-center text-sm text-text-muted">
          Écrivez un message pour poursuivre avec l'agent (contexte : dossier {journey.journeyId}).
        </p>
      )}

      {/* Proposition de mémorisation (§35) */}
      {proposal ? (
        <Card className="border-primary/30 bg-primary/5 p-4">
          <p className="text-sm font-semibold text-text1">Voulez-vous que je mémorise cela ?</p>
          <p className="mt-1 line-clamp-2 text-sm text-text2">{proposal}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {MEMORY_CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={
                  category === c
                    ? "min-h-11 rounded-full bg-primary px-4 text-sm font-semibold text-[#04211a] transition-colors"
                    : "min-h-11 rounded-full border border-border bg-surface px-4 text-sm font-semibold text-text2 transition-colors hover:bg-surface-hover"
                }
              >
                {MEMORY_CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="ghost" onClick={() => setProposal(null)}>
              Pas maintenant
            </Button>
            <Button onClick={saveProposal}>Mémoriser</Button>
          </div>
        </Card>
      ) : null}

      {/* Composer (§35) */}
      <div className="sticky bottom-24 md:bottom-4">
        <div className="flex items-end gap-2 rounded-2xl border border-border bg-surface p-2 shadow-elevated backdrop-blur-xl">
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
            placeholder="Écrivez votre message… (Entrée pour envoyer)"
            aria-label="Votre message"
            className="max-h-40 border-0 bg-transparent focus:ring-0"
          />
          <button
            type="button"
            aria-label="Envoyer"
            disabled={!canSend}
            onClick={send}
            className="focus-visible flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent-ai text-[#04211a] transition-transform duration-micro active:scale-[0.95] disabled:opacity-40"
          >
            <SendIcon className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}