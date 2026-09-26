import { redirect } from "next/navigation";

/** Alias Cahier §2 : `/actions` → l'écran Actions. */
export default function ActionsAlias() {
  redirect("/app/actions");
}