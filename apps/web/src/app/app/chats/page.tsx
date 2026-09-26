"use client";

/**
 * Chats — `/app/chats` : l'historique RÉEL des conversations (GET /api/conversations,
 * isolé par usager). Créer, renommer, supprimer : tout passe par le serveur.
 * Avant : une seule ligne, reconstruite depuis le parcours en cache de session.
 */
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card, EmptyState, ErrorNotice, Input, SkeletonCard } from "@/components/ui";
import { Modal, useToast } from "@/components/ui/overlays";
import { ChatIcon, PlusIcon, SettingsIcon, TrashIcon } from "@/components/icons";
import {
  useConversations,
  useCreateConversation,
  useDeleteConversation,
  useRenameConversation,
} from "@/lib/query/conversations";
import { useJourneyStore } from "@/lib/state/stores";
import type { Conversation } from "@/lib/schemas";

function when(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function ChatsPage() {
  const router = useRouter();
  const toast = useToast();
  const journeyId = useJourneyStore((s) => s.response?.journeyId);
  const list = useConversations();
  const create = useCreateConversation();
  const rename = useRenameConversation();
  const remove = useDeleteConversation();
  const [renaming, setRenaming] = useState<Conversation | null>(null);
  const [title, setTitle] = useState("");
  const [deleting, setDeleting] = useState<Conversation | null>(null);

  async function startConversation() {
    const c = await create.mutateAsync({ title: "Nouvelle conversation", journeyId });
    router.push(`/app/chats/${c.id}`);
  }

  async function confirmRename() {
    if (!renaming || !title.trim()) return;
    await rename.mutateAsync({ id: renaming.id, title: title.trim() });
    toast.toast({ title: "Conversation renommée.", tone: "success" });
    setRenaming(null);
  }

  async function confirmDelete() {
    if (!deleting) return;
    await remove.mutateAsync(deleting.id);
    toast.toast({ title: "Conversation supprimée.", tone: "neutral" });
    setDeleting(null);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Chats</h1>
          <p className="mt-1 text-sm text-text2">Vos conversations avec l'agent.</p>
        </div>
        <Button variant="gradient" size="sm" onClick={startConversation} loading={create.isPending}>
          <PlusIcon className="h-4 w-4" /> Nouvelle
        </Button>
      </div>

      {list.isLoading ? (
        <SkeletonCard lines={3} />
      ) : list.isError ? (
        <ErrorNotice error={list.error} action="Le chargement des conversations" onRetry={() => list.refetch()} />
      ) : !list.data?.length ? (
        <EmptyState
          emoji={<ChatIcon className="h-9 w-9" />}
          title="Aucune conversation pour l'instant"
          description="Posez une question à l'agent sur votre démarche : l'échange est conservé ici."
          action={
            <Button variant="gradient" size="lg" onClick={startConversation} loading={create.isPending}>
              Commencer une conversation
            </Button>
          }
        />
      ) : (
        <Card className="p-2">
          <ul className="flex flex-col">
            {list.data.map((c) => (
              <li key={c.id} className="flex items-center gap-2 rounded-lg hover:bg-surface-hover">
                <Link
                  href={`/app/chats/${c.id}`}
                  className="focus-visible flex min-h-16 min-w-0 flex-1 items-center gap-4 rounded-lg px-4 py-3"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-text2">
                    <ChatIcon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{c.title || "Conversation"}</span>
                    <span className="block text-sm text-text2">{when(c.lastActivityAt ?? c.createdAt)}</span>
                  </span>
                </Link>
                <button
                  type="button"
                  aria-label={`Renommer « ${c.title || "Conversation"} »`}
                  onClick={() => {
                    setTitle(c.title ?? "");
                    setRenaming(c);
                  }}
                  className="focus-visible flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text2 hover:text-text1"
                >
                  <SettingsIcon className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  aria-label={`Supprimer « ${c.title || "Conversation"} »`}
                  onClick={() => setDeleting(c)}
                  className="focus-visible mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text2 hover:text-error"
                >
                  <TrashIcon className="h-5 w-5" />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Modal
        open={Boolean(renaming)}
        onClose={() => setRenaming(null)}
        title="Renommer la conversation"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRenaming(null)}>Annuler</Button>
            <Button onClick={confirmRename} loading={rename.isPending} disabled={!title.trim()}>
              Enregistrer
            </Button>
          </>
        }
      >
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={255}
          aria-label="Titre de la conversation"
          autoFocus
        />
      </Modal>

      <Modal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Supprimer la conversation ?"
        description="L'historique de cet échange sera effacé. Votre dossier n'est pas touché."
        destructive
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>Annuler</Button>
            <Button variant="destructive" onClick={confirmDelete} loading={remove.isPending}>
              Supprimer
            </Button>
          </>
        }
      />
    </div>
  );
}
