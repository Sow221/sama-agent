import { redirect } from "next/navigation";

/** Alias Cahier §2 : `/onboarding/memory` → étape 4 (mémoire) du wizard. */
export default function MemoryStep() {
  redirect("/onboarding?step=memory");
}