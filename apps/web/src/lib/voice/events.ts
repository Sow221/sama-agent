/**
 * Aide à l'émission des événements voix (contrat voiceEventSchema, ADR-007 §8).
 *
 * `safeVoiceEvent` a été supprimé : il n'était appelé nulle part (0 site d'appel),
 * donc aucune validation n'était jamais appliquée avant l'envoi sur le DataChannel.
 * La validation est désormais appliquée au point d'émission, dans `VoiceRoom.send`
 * (`voiceEventSchema.parse`) : la garder ici en doublon n'aurait servi à rien.
 */
export { parseAgentEvent } from "@/lib/voice/livekit";
