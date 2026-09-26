/**
 * Lecture initiale de la session — machine à états pure, testable sans DOM.
 *
 * Elle existe parce que le défaut qu'elle encode était INVISIBLE et total :
 * `AuthProvider` appelait `getSession().then(...)` sans `catch`. Un rejet
 * (configuration Supabase incohérente, réseau bloqué, clé révoquée) laissait
 * `loading` à `true` pour toujours, et `AuthGate` rendait son spinner sur
 * toutes les pages — sans message, sans action, sans journal. Constaté en e2e :
 * l'application entière réduite à « chargement », sur les quatre tests.
 *
 * Le contrat tenu ici, et vérifié par `session-bootstrap.test.ts` :
 *  1. cette fonction ne REJETTE jamais ;
 *  2. un échec de lecture est DISTINGUÉ d'une absence de session, parce que les
 *     deux ne mènent pas au même écran (page de connexion vs. erreur explicite) ;
 *  3. l'échec est décrit en français, sans divulguer de détail technique.
 */
import type { Session } from "@supabase/supabase-js";
import type { SupabaseAuth } from "./supabase";

/** Message affiché quand la lecture de session est impossible. */
export const SESSION_UNAVAILABLE =
  "Impossible de vérifier votre session. Rechargez la page.";

export interface SessionOutcome {
  /** Session trouvée, ou `null` si l'usager n'est pas connecté. */
  session: Session | null;
  /** Cause lisible de l'échec, ou `null` si la lecture a réussi. */
  error: string | null;
}

/**
 * Lit la session une fois, sans jamais rejeter.
 *
 * `flow === null` signifie « Supabase non configuré » (harnais) : ce n'est pas
 * une erreur, c'est un état normal où l'identité de service du worker s'applique.
 *
 * Elle ne s'abonne PAS à `onAuthStateChange` : l'abonnement a une durée de vie
 * (il doit être résilié au démontage) et n'appartient pas à une lecture ponctuelle.
 * `AuthProvider` le gère séparément, avec son propre `try/catch`.
 */
export async function readSessionOnce(flow: SupabaseAuth | null): Promise<SessionOutcome> {
  if (!flow) return { session: null, error: null };
  try {
    return { session: (await flow.getSession()) ?? null, error: null };
  } catch {
    return { session: null, error: SESSION_UNAVAILABLE };
  }
}
