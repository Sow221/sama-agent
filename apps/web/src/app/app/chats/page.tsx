"use client";

/**
 * Chats — `/app/chats` (UI/UX Master Spec §42-43, §65).
 * Liste des conversations : pour l'instant le parcours de session réel (journey serveur).
 * État vide honnête avec action « Nouvelle conversation ».
 */
import Link from "next/link";
import { Button, Card, EmptyState, ListItem } from "@/components/ui";
import { ChatIcon, PlusIcon } from "@/components/icons";
import { useJourneyStore, usePersistReady } from "@/lib/state/stores";

export default function ChatsPage() {
  const journey = useJourneyStore((s) => s.response);
  const ready = usePersistReady();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Chats</h1>
          <p className="mt-1 text-sm text-text2">Vos conversations avec l'agent.</p>
        </div>
        <Link href="/app/home" className="focus-visible">
          <Button variant="gradient" size="sm">
            <PlusIcon className="h-4 w-4" /> Nouvelle
          </Button>
        </Link>
      </div>

      {ready && !journey ? (
        <EmptyState
          emoji="💬"
          title="Aucune conversation pour l'instant"
          description="Parlez à votre agent ou décrivez votre démarche : le parcours apparaîtra ici, suivi en temps réel."
          action={
            <Link href="/app/home" className="focus-visible">
              <Button variant="gradient" size="lg">Commencer une conversation</Button>
            </Link>
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {journey ? (
            <Card className="p-2">
              <ListItem
                icon={<ChatIcon className="h-5 w-5" />}
                title={`Parcours ${journey.procedureId}`}
                description={journey.nextActionLabel ?? "Conversation avec Sama Agent"}
                trailing={
                  <span className="rounded-full border border-accent-ai/30 bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent-ai">
                    {Math.round(journey.completion.ratio * 100)}%
                  </span>
                }
                href={`/app/chats/${journey.journeyId}`}
              />
              <p className="px-4 pb-2 pt-1 text-xs text-text-muted">
                Dernier échange de la session · les données viennent du serveur (reprise par dossier).
              </p>
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}