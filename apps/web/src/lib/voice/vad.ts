/**
 * Microphone → VAD Silero WASM (ADR-004 : VAD côté client).
 * API réelle @ricky0123/vad-web v0.0.31 : la v0.0.31 remplace l'option `stream`
 * par getStream/pauseStream/resumeStream (+ startOnLoad). `start()` reprend le
 * rôle de l'ancien `resume()`. onSpeechStart/onSpeechEnd : signatures inchangées.
 *  - onSpeechStart → barge-in + phase "J'écoute…"
 *  - onSpeechEnd → le segment audio réel (Float32Array 16 kHz) + event user_segment
 */
import { getDefaultRealTimeVADOptions, MicVAD as RickyMicVAD } from "@ricky0123/vad-web";

export interface VadCallbacks {
  onSpeechStart: () => void;
  /** Segment audio réel détecté (16 kHz, entre -1 et 1) — publié puis traitée par le worker. */
  onSpeechEnd: (segment: Float32Array) => void;
}

export class SileroVad {
  private vad: RickyMicVAD | null = null;
  private disposed = false;

  /** Démarre la détection sur le flux micro fourni (déjà initialisé par LiveKit). */
  async start(stream: MediaStream, cb: VadCallbacks): Promise<void> {
    if (this.vad) return;
    const defaults = getDefaultRealTimeVADOptions("v5");
    const vad = await RickyMicVAD.new({
      ...defaults,
      model: "v5",
      // Le flux est déjà fourni (LiveKit) : on ne le coupe ni ne le ré-acquiert jamais.
      getStream: async () => stream,
      pauseStream: async () => {},
      resumeStream: async () => stream,
      startOnLoad: false,
      onSpeechStart: () => {
        if (!this.disposed) cb.onSpeechStart();
      },
      onSpeechEnd: (segment) => {
        if (!this.disposed) cb.onSpeechEnd(segment);
      },
    });
    this.vad = vad;
    vad.start();
  }

  pause(): void {
    this.vad?.pause();
  }

  /** v0.0.31 : `start()` reprend l'écoute après pause. */
  resume(): Promise<void> | void {
    return this.vad?.start();
  }

  destroy(): void {
    this.disposed = true;
    void this.vad?.destroy();
    this.vad = null;
  }
}

/** Fabrique : une seule instance de VAD pour la session courante. */
export function createMicVad(): SileroVad {
  return new SileroVad();
}