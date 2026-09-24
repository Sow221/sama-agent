/**
 * Trace distribuée (C §55) : un requestId est généré côté client et propagé
 * à chaque appel API (header x-request-id) pour corréler les logs worker.
 */
export function newTraceId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `trc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}