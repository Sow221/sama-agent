/**
 * Identifiant de parcours PAR-USAGER (appropriation serveur : journeys.user_id).
 * Sans utilisateur (harnais/démonstration) : l'identifiant canonique de la procédure,
 * inchangé pour la démo. Avec un utilisateur authentifié : un identifiant unique
 * déterministe par usager — le dossier survit au rechargement et ne peut pas
 * entrer en collision avec celui d'un autre usager (403 côté serveur sinon).
 */
export function journeyIdFor(procedureId: string, userId: string | null | undefined): string {
  if (!userId) return procedureId;
  const anchor = userId.replace(/[^a-z0-9]/gi, "").slice(0, 8).toLowerCase();
  return `${procedureId}-${anchor}`;
}