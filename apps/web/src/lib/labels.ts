/**
 * Libellés d'affichage — jamais un identifiant de moteur à l'écran.
 *
 * Les statuts viennent de la source unique `enums.json` (générés). Les noms de
 * pièces et de procédures viennent du SERVEUR (`JourneyDocument.name`,
 * data/procedures) ; les tables ci-dessous ne servent que de repli quand l'écran
 * n'a pas encore l'état du dossier (ex. accès direct à une page Preuve).
 */
import { DOCUMENT_STATUS_LABEL } from "@sama/shared/gen/enums";
import type { JourneyResponse } from "@/lib/schemas";

/** Miroir de data/procedures/driving_license_new.json (repli d'affichage). */
const REQUIREMENT_FALLBACK: Record<string, string> = {
  identity: "Pièce d'identité",
  medical: "Certificat médical",
  photos: "Photographies",
};

const PROCEDURE_LABEL: Record<string, string> = {
  driving_license_new: "Première demande de permis de conduire",
};

/** Nom lisible d'une exigence : celui du serveur s'il est connu, sinon le repli. */
export function requirementLabel(
  requirementId: string | null | undefined,
  journey?: JourneyResponse | null
): string {
  if (!requirementId) return "";
  const fromServer = journey?.documents.find((d) => d.requirementId === requirementId)?.name;
  return fromServer || REQUIREMENT_FALLBACK[requirementId] || "Pièce du dossier";
}

export function procedureLabel(procedureId: string | null | undefined): string {
  if (!procedureId) return "Démarche en cours";
  return PROCEDURE_LABEL[procedureId] ?? "Démarche administrative";
}

export function documentStatusLabel(status: string): string {
  return (DOCUMENT_STATUS_LABEL as Record<string, string>)[status] ?? "Indéterminé";
}
