import { redirect } from "next/navigation";

/** Alias Cahier §2 : `/help` → les limites & aide (page réelle, honnête). */
export default function HelpAlias() {
  redirect("/limits");
}