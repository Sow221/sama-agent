import { redirect } from "next/navigation";

/** Alias Cahier §2 : `/memory/:id` → le détail d'une pièce mémorisée. */
export default async function MemoryDetailAlias({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/app/memory/${encodeURIComponent(id)}`);
}