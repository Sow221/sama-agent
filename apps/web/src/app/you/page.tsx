import { redirect } from "next/navigation";

/** Alias Cahier §2 : `/you` → le profil (workspace). */
export default function YouAlias() {
  redirect("/app/you");
}