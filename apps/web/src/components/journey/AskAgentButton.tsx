"use client";

/** Ouvre une conversation avec l'agent, liée à CE dossier (POST /api/conversations). */
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { ChatIcon } from "@/components/icons";
import { useCreateConversation } from "@/lib/query/conversations";
import { procedureLabel } from "@/lib/labels";

export function AskAgentButton({ journeyId, procedureId }: { journeyId: string; procedureId: string }) {
  const router = useRouter();
  const create = useCreateConversation();
  return (
    <Button
      variant="ghost"
      className="w-full"
      loading={create.isPending}
      onClick={async () => {
        const c = await create.mutateAsync({ title: procedureLabel(procedureId), journeyId });
        router.push(`/app/chats/${c.id}`);
      }}
    >
      <ChatIcon className="h-5 w-5" />
      Poser une question à l'agent
    </Button>
  );
}
