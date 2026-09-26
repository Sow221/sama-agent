import { redirect } from "next/navigation";

/** Alias Cahier §2 : `/memory` → l'écran Mémoire. */
export default function MemoryAlias() {
  redirect("/app/memory");
}