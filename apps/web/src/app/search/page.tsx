import { redirect } from "next/navigation";

/** Alias Cahier §2 : `/search` → la recherche. */
export default function SearchAlias() {
  redirect("/app/search");
}