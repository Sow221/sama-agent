/**
 * Aide à l'émission des événements voix (contrat voiceEventSchema, ADR-007 §8).
 */
import { voiceEventSchema, type VoiceEvent } from "@/lib/schemas";

/** Valide avant envoi : jamais d'événement mal formé sur le DataChannel. */
export function safeVoiceEvent(e: VoiceEvent): VoiceEvent {
  return voiceEventSchema.parse(e);
}