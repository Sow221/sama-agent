/**
 * Connexion LiveKit (ADR-004) : Room, publication du micro, abonnement au speaker IA,
 * DataChannel pour les événements voix (barge_in, user_segment, cancel…).
 */
import { Room, RoomEvent, Track } from "livekit-client";
import type { VoiceEvent } from "@/lib/schemas";

export interface VoiceRoomCallbacks {
  onRemoteAudio: (element: HTMLAudioElement) => void;
  onRemoteDisconnected: () => void;
  onError: (err: unknown) => void;
}

export class VoiceRoom {
  room: Room | null = null;
  private audioEl: HTMLAudioElement | null = null;

  /** connect + publication du micro. Le token est réel (émission FastAPI §worker). */
  async connect(
    url: string,
    token: string,
    cb: VoiceRoomCallbacks
  ): Promise<void> {
    await this.disconnect();

    const room = new Room({ adaptiveStream: true });
    this.room = room;

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

    await room.connect(url, token);
    await room.localParticipant.setMicrophoneEnabled(true);
  }

  /** Envoie un événement structuré sur le DataChannel (schéma voiceEventSchema). */
  send(event: VoiceEvent): void {
    this.room?.localParticipant.publishData(
      new TextEncoder().encode(JSON.stringify(event)),
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
    }
  }
}