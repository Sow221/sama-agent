import { redirect } from "next/navigation";

/** Alias Cahier §2 : `/home` → l'accueil de l'espace applicatif. */
export default function HomeAlias() {
  redirect("/app/home");
}