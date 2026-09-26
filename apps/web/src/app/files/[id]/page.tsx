import { redirect } from "next/navigation";

/**
 * Alias Cahier §2 : `/files/:id` → le détail d'une pièce.
 * La pièce vit dans la Mémoire (analyse réelle) — redirection honnête.
 */
export default async function FileDetailAlias({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/app/memory/${encodeURIComponent(id)}`);
}