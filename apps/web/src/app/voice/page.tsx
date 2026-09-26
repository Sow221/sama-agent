import { redirect } from "next/navigation";

/** Alias Cahier §2 : `/voice` → la session vocale. */
export default function VoiceAlias() {
  redirect("/app/voice");
}