import { redirect } from "next/navigation";

/** Alias Cahier §2 : `/settings` → le profil (account = première section). */
export default function SettingsAlias() {
  redirect("/app/you");
}