/**
 * Garde d'onboarding (UI/UX Master Spec §23-27).
 * L'onboarding se fait une fois, après la première connexion réelle.
 * Flag local uniquement (préférence produit, pas une donnée métier).
 */
export function isOnboardingDone(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem("sama:onboarding") === "done";
}

export function completeOnboarding(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("sama:onboarding", "done");
}

export function resetOnboarding(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem("sama:onboarding");
}