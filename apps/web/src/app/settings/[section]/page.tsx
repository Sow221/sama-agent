import { redirect } from "next/navigation";

/**
 * Alias Cahier §2 : `/settings/:section` → les sections du profil.
 * Sections officielles : account · agent · voice · preferences · privacy.
 * Toute section inconnue tombe sur le profil (comportement sûr).
 */
const SAFE_SECTIONS = new Set([
  "account",
  "agent",
  "voice",
  "preferences",
  "privacy",
  "help",
]);

export default async function SettingsSectionAlias({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  redirect(SAFE_SECTIONS.has(section) ? `/app/you/${section}` : "/app/you");
}