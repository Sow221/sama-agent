/**
 * Traduire une erreur technique en un message honnête pour l'usager.
 *
 * Le problème que ce module résout : sept écrans affichaient la même phrase
 * figée — « … a échoué. Réessayez. » — quel que soit l'échec. Un 400 (contrat
 * invalide), un 401 (session expirée) et un 502 (worker arrêté) sont trois
 * situations sans remède commun, et l'usager ne pouvait ni comprendre ni
 * signaler quoi que ce soit : aucun code, aucun identifiant de trace.
 *
 * Règle : ne jamais inventer une cause. On dit ce qu'on sait (le statut HTTP,
 * l'identifiant de requête) et on avoue ce qu'on ignore.
 */
import { ApiError } from "./client";

/** Ce que l'usager peut réellement faire, par classe d'échec. */
export interface UserFacingError {
  /** Message affichable, en français, sans jargon. */
  message: string;
  /** Identifiant de trace : à citer au support. Vrai seulement si on l'a. */
  requestId?: string;
  /** Vrai si réessayer peut réussir (transitoire). */
  retryable: boolean;
  /** Statut HTTP si l'erreur vient bien de l'API. */
  status?: number;
}

/** Détecte l'échec réseau : `fetch` rejette avec une TypeError, pas une Response. */
function isNetworkFailure(err: unknown): boolean {
  return (
    err instanceof TypeError &&
    /fetch|network|load failed|Failed to fetch|ECONNREFUSED/i.test(err.message)
  );
}

/**
 * Analyse une erreur de mutation/query en message affichable.
 *
 * `action` décrit l'opération en français, ex. « L'analyse de la demande ».
 * `ApiError.message` contient déjà statut + extrait du corps de réponse ; on ne
 * le montre pas tel quel à l'usager (il peut contenir du JSON technique), mais
 * on conserve le code de trace.
 */
export function toUserFacingError(err: unknown, action = "L'opération"): UserFacingError {
  if (isNetworkFailure(err)) {
    return {
      message: `${action} est impossible : le service ne répond pas. Vérifiez votre connexion puis réessayez.`,
      retryable: true,
    };
  }

  if (err instanceof ApiError) {
    const { status, requestId } = err;
    if (status === 401) {
      return {
        message: "Votre session a expiré. Reconnectez-vous pour continuer.",
        requestId,
        retryable: false,
        status,
      };
    }
    if (status === 403) {
      return {
        message: `${action} n'est pas autorisée pour ce dossier.`,
        requestId,
        retryable: false,
        status,
      };
    }
    if (status === 404) {
      return {
        message: `${action} : le dossier demandé est introuvable.`,
        requestId,
        retryable: false,
        status,
      };
    }
    if (status === 429) {
      return {
        message: "Trop de demandes. Patientez un instant avant de réessayer.",
        requestId,
        retryable: true,
        status,
      };
    }
    if (status >= 500) {
      return {
        message: `${action} a échoué côté service (erreur ${status}). Réessayez dans un instant.`,
        requestId,
        retryable: true,
        status,
      };
    }
    // 4xx restant : la requête est en cause, réessayer seul n'y changera rien.
    return {
      message: `${action} a été refusée par le service (erreur ${status}).`,
      requestId,
      retryable: false,
      status,
    };
  }

  if (err instanceof Error) {
    // Erreur de validation Zod ou inattendue : on ne prétend pas connaître la
    // cause, on donne le message réel et la trace si elle existe.
    return {
      message: `${action} a échoué : ${err.message}`,
      retryable: true,
    };
  }

  return { message: `${action} a échoué pour une raison inconnue.`, retryable: true };
}

/** Identifiant de trace formaté, à n'afficher que s'il existe vraiment. */
export function traceRef(requestId?: string): string | null {
  return requestId ? `Référence : ${requestId}` : null;
}
