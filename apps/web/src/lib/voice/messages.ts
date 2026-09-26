/**
 * Messages vocaux affichables — français, sans jargon, avec l'action possible.
 *
 * Avant : l'écran voix affichait l'erreur brute (« Requested device not found »,
 * `API /api/voice/token → 409 : {"detail":…}`) et les erreurs du worker sous la
 * forme « message (code) ». La cause réelle reste la seule source : on la
 * traduit, on n'en invente pas.
 */
import { ApiError } from "@/lib/api-client/client";
import type { AgentErrorCode } from "@/lib/schemas";

export interface VoiceFailure {
  message: string;
  /** Le remède utile : créer un parcours, autoriser le micro, ou réessayer. */
  remedy: "start_journey" | "allow_mic" | "retry" | "text";
}

export function voiceFailure(err: unknown): VoiceFailure {
  if (err instanceof ApiError) {
    if (err.status === 409)
      return {
        message: "Commencez d'abord un parcours : la session vocale s'appuie sur votre dossier.",
        remedy: "start_journey",
      };
    if (err.status === 401)
      return { message: "Votre session a expiré. Reconnectez-vous pour parler à l'agent.", remedy: "retry" };
    if (err.status === 503)
      return { message: "Le service vocal n'est pas disponible sur ce serveur pour le moment.", remedy: "text" };
    if (err.status === 429)
      return { message: "Trop de tentatives rapprochées. Patientez une minute puis réessayez.", remedy: "retry" };
    return { message: "Le service vocal n'a pas répondu. Réessayez dans un instant.", remedy: "retry" };
  }
  const name = err instanceof Error ? err.name : "";
  if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError")
    return { message: "Aucun micro n'a été détecté sur cet appareil.", remedy: "text" };
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError")
    return {
      message: "L'accès au micro a été refusé. Autorisez-le dans les réglages du navigateur, puis réessayez.",
      remedy: "allow_mic",
    };
  if (name === "NotReadableError" || name === "TrackStartError")
    return { message: "Le micro est déjà utilisé par une autre application.", remedy: "retry" };
  if (err instanceof TypeError)
    return { message: "Connexion impossible. Vérifiez votre réseau puis réessayez.", remedy: "retry" };
  return { message: "La connexion au service vocal a échoué. Réessayez ou continuez par écrit.", remedy: "retry" };
}

/** Erreurs envoyées par le worker pendant la session (`agent_error`). */
const AGENT_ERROR_MESSAGE: Record<AgentErrorCode, string> = {
  asr_unavailable: "La reconnaissance vocale est indisponible pour le moment. Vous pouvez écrire votre demande.",
  tts_unavailable: "La voix de l'agent est indisponible : sa réponse s'affiche ci-dessus.",
  no_journey: "Aucun dossier n'est associé à cette session. Commencez un parcours.",
  unknown_room: "Cette session vocale n'est pas reconnue. Relancez-la.",
  turn_failed: "L'agent n'a pas pu traiter cette phrase. Reformulez ou réessayez.",
};

export function agentErrorMessage(code: AgentErrorCode | string): string {
  return AGENT_ERROR_MESSAGE[code as AgentErrorCode] ?? AGENT_ERROR_MESSAGE.turn_failed;
}
