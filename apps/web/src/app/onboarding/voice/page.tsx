import { redirect } from "next/navigation";

/** Alias Cahier §2 : `/onboarding/voice` → étape 2 (voix) du wizard d'onboarding. */
export default function VoiceStep() {
  redirect("/onboarding?step=voice");
}