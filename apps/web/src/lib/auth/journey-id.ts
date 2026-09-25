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

/**
 * Procédure dont dérive un identifiant de dossier. Le moteur résout la procédure
 * par `procedureId` (sinon par `journeyId`) ; un dossier par-usager porte un
 * suffixe `-<8 caractères>`, qu'il faut retirer pour retrouver la procédure.
 * L'identifiant canonique (harnais) reste inchangé.
 */
export function procedureIdOf(journeyId: string): string {
  return journeyId.replace(/-[a-z0-9]{8}$/, "");
}