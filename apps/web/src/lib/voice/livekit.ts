/**
 * Connexion LiveKit (ADR-004) : Room, publication du micro, abonnement au speaker IA,
 * DataChannel pour les événements voix (barge_in, user_segment, cancel…).
 *
 * Correction majeure : le canal de données est désormais **lu**. Avant, cette classe
 * n'abonnait qu'à `TrackSubscribed`/`TrackUnsubscribed` — aucun `DataReceived`. Le
 * worker pouvait donc émettre autant d'événements qu'il voulait (`agent_state`,
 * `agent_text`, `agent_error`) et personne ne les recevait jamais. Concrètement, le
 * front ne pouvait pas savoir ce que l'agent faisait, ni afficher la transcription
 * réelle, et était contraint d'afficher « Je vous écoute… » en permanence.
 */
import { Room, RoomEvent, Track, type RemoteParticipant } from "livekit-client";
import { agentEventSchema, voiceEventSchema, type AgentEvent, type VoiceEvent } from "@/lib/schemas";

export interface VoiceRoomCallbacks {
  onRemoteAudio: (element: HTMLAudioElement) => void;
  onRemoteDisconnected: () => void;
  onError: (err: unknown) => void;
  /** Événement REAL reçu du worker (état, transcription, erreur). */
  onAgentEvent?: (event: AgentEvent) => void;
}

export class VoiceRoom {
  room: Room | null = null;
  private audioEl: HTMLAudioElement | null = null;
  /** Dernier `turnId` déjà traité : un `turnId` plus ancien est ignoré (barge-in). */
  private lastTurn = 0;

  /** connect + publication du micro. Le token est réel (émission FastAPI §worker). */
  async connect(
    url: string,
    token: string,
    cb: VoiceRoomCallbacks
  ): Promise<void> {
    await this.disconnect();

    const room = new Room({ adaptiveStream: true });
    this.room = room;
    this.lastTurn = 0;

    room.on(RoomEvent.TrackSubscribed, (track, _pub) => {
      if (track.kind === Track.Kind.Audio) {
        // Track audio IA réelle (le worker publie sa voix TTS : on y attache un élément).
        const el = track.attach();
        this.audioEl = el;
        el.autoplay = true;
        cb.onRemoteAudio(el);
      }
    });
    room.on(RoomEvent.TrackUnsubscribed, (_track) => {
      cb.onRemoteDisconnected();
    });

    // ── Le canal serveur → client, enfin branché ─────────────────────────
    room.on(RoomEvent.DataReceived, (payload: Uint8Array, _participant?: RemoteParticipant) => {
      const event = parseAgentEvent(payload);
      if (!event) return; // octet illisible : on l'ignore, on ne casse pas la session
      if (!cb.onAgentEvent) return;
      // Anti-rejeu : une réponse d'un tour déjà abandonné ne doit pas réapparaître.
      if (event.turnId != null && turnIndex(event.turnId) < this.lastTurn) return;
      if (event.turnId != null) this.lastTurn = turnIndex(event.turnId);
      cb.onAgentEvent(event);
    });

    await room.connect(url, token);
    await room.localParticipant.setMicrophoneEnabled(true);
  }

  /** Envoie un événement structuré sur le DataChannel (schéma voiceEventSchema). */
  send(event: VoiceEvent): void {
    // On valide avant envoi : jamais d'événement mal formé sur le DataChannel.
    const safe = voiceEventSchema.parse(event);
    this.room?.localParticipant.publishData(
      new TextEncoder().encode(JSON.stringify(safe)),
      { reliable: true }
    );
  }

  /** Coupe la lecture de la voix IA (barge-in / cancel). */
  stopAgentAudio(): void {
    this.audioEl?.pause();
    this.audioEl?.removeAttribute("src");
    this.audioEl = null;
  }

  async disconnect(): Promise<void> {
    if (!this.room) return;
    try {
      this.room.disconnect();
    } finally {
      this.room = null;
      this.audioEl = null;
      this.lastTurn = 0;
    }
  }
}

/**
 * Décode un événement worker. Ne lève JAMAIS : un octet illisible reçu du réseau
 * ne doit pas faire tomber la session vocale en cours.
 */
export function parseAgentEvent(payload: Uint8Array | string): AgentEvent | null {
  try {
    const text = typeof payload === "string" ? payload : new TextDecoder().decode(payload);
    const parsed = agentEventSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** `t12` → 12. Un identifiant non numérique vaut 0 (donc « ancien », donc ignoré). */
function turnIndex(turnId: string): number {
  const n = Number.parseInt(turnId.replace(/^t/, ""), 10);
  return Number.isFinite(n) ? n : 0;
}
