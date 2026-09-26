import { redirect } from "next/navigation";

/** Alias Cahier §2 : `/files` → l'écran Fichiers. */
export default function FilesAlias() {
  redirect("/app/files");
}