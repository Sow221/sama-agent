import { redirect } from "next/navigation";

/** Alias Cahier §2 : `/onboarding/permissions` → étape 3 (micro) du wizard. */
export default function PermissionsStep() {
  redirect("/onboarding?step=permissions");
}