import { redirect } from "next/navigation";

/** Alias Cahier §2 : `/chat/:id` → la conversation (workspace applicatif). */
export default async function ChatAlias({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/app/chats/${encodeURIComponent(id)}`);
}