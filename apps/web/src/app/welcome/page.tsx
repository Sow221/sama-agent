import { redirect } from "next/navigation";

/** Alias Cahier §2 : `/welcome` → l'accueil de l'application (`/`). */
export default function WelcomeAlias() {
  redirect("/");
}