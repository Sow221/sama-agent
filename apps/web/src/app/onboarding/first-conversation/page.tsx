import { redirect } from "next/navigation";

/** Alias Cahier §2 : `/onboarding/first-conversation` → dernière étape du wizard. */
export default function FirstConversationStep() {
  redirect("/onboarding?step=first-conversation");
}