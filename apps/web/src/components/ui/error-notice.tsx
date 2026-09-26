"use client";

/**
 * Affichage d'un échec — un seul composant pour tous les écrans.
 *
 * Pourquoi ce composant existe : les écrans écrivaient chacun leur `<p>` avec
 * une phrase figée du type « … a échoué. Réessayez. » et, quand ils l'affichaient,
 * un bouton de reprise… qui n'existait pas. Le texte promettait une action que
 * l'écran ne proposait pas.
 *
 * Deux garanties offertes ici :
 *  1. le message vient de `toUserFacingError`, donc il décrit la cause réelle ;
 *  2. le bouton « Réessayer » n'apparaît QUE si l'échec est transitoire. Aucun
 *     bouton qui ne marche pas, aucune promesse non tenue.
 */
import { toUserFacingError, traceRef, type UserFacingError } from "@/lib/api-client/errors";
import { Button } from "./index";

export function ErrorNotice({
  error,
  action = "L'opération",
  onRetry,
  className = "",
}: {
  /** L'erreur brute (`mutation.error` / `query.error`). */
  error: unknown;
  /** L'opération en français, ex. « La lecture du dossier ». */
  action?: string;
  /** Fonction de reprise. Sans elle, aucun bouton n'est rendu. */
  onRetry?: () => void;
  className?: string;
}) {
  if (!error) return null;
  const info: UserFacingError = toUserFacingError(error, action);
  const trace = traceRef(info.requestId);
  const canRetry = typeof onRetry === "function" && info.retryable;

  return (
    <div
      role="alert"
      data-testid="error-notice"
      data-retryable={info.retryable ? "true" : "false"}
      className={`flex flex-col items-start gap-3 rounded-xl border border-error/30 bg-error/5 p-4 ${className}`}
    >
      <p className="text-sm font-semibold text-error">{info.message}</p>
      {trace ? <p className="text-xs text-text-muted">{trace}</p> : null}
      {canRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Réessayer
        </Button>
      ) : null}
    </div>
  );
}
