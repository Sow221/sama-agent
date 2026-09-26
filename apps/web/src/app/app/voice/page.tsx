"use client";

/**
 * Voice workspace — `/app/voice` (UI/UX Master Spec §30-32, §114, §117-120).
 * Chaîne TOUT réelle : LiveKit (WebRTC) + VAD Silero WASM → worker (Kiriku ASR →
 * GLM → Journey → xTTS wolof). Le Core domine, les distracteurs disparaissent.
 * - Phases d'état pilotées par la session réelle (jamais devinées, §153).
 * - Fallback texte honnête si micro/VAD/LiveKit échouent (§120) — on ne bloque jamais.
 * - Aucune transcription factice : le transcript n'apparaît que si du texte RÉEL
 *   est disponible côté client.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { VoiceCore, type CoreState } from "@/components/voice/VoiceCore";
import { PhaseHeader } from "@/components/voice/PhaseHeader";
import { CancelButton } from "@/components/voice/CancelButton";
import { Button, Card } from "@/components/ui";
import { useVoiceStore } from "@/lib/state/stores";
import { VoiceRoom } from "@/lib/voice/livekit";
import { createMicVad, type SileroVad } from "@/lib/voice/vad";
import { useVoiceToken } from "@/lib/query/hooks";

const PHASE_TO_CORE: Record<string, CoreState> = {
  connecting: "connecting",
  idle: "idle",
  listening: "listening",
  thinking: "processing",
  speaking: "speaking",
};

export default function VoicePage() {
  const router = useRouter();
  const roomRef = useRef<VoiceRoom | null>(null);
  const vadRef = useRef<SileroVad | null>(null);
  const mediaRef = useRef<MediaStream | null>(null);
  const cbRef = useRef<{ onRemoteAudio: (el: HTMLAudioElement) => void } | null>(null);
  const [failed, setFailed] = useState(false);

  const phase = useVoiceStore((s) => s.phase);
  const setPhase = useVoiceStore((s) => s.setPhase);
  const setConnected = useVoiceStore((s) => s.setConnected);
  const setActive = useVoiceStore((s) => s.setActive);
  const startSegment = useVoiceStore((s) => s.startSegment);
  const endSegment = useVoiceStore((s) => s.endSegment);
  const resetVoice = useVoiceStore((s) => s.reset);

  const tokenQuery = useVoiceToken();

  const takeMic = useCallback(async () => {
    if (mediaRef.current) return mediaRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRef.current = stream;
    return stream;
  }, []);

  const start = useCallback(async () => {
    setPhase("connecting");
    setFailed(false);
    try {
      const { url, token } = await tokenQuery.refetch().then((r) => r.data!);
      const stream = await takeMic();

      // Expose l'analyseur du micro pour que l'orbe réagisse au volume réel (listening)
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      window.dispatchEvent(new CustomEvent("sama:analyser", { detail: analyser }));

      const room = new VoiceRoom();
      roomRef.current = room;
      cbRef.current = {
        onRemoteAudio: (el) => {
          // La voix IA réelle : bascule l'analyseur sur la sortie pendant « Je réponds… »
          const actx = new AudioContext();
          const src = actx.createMediaElementSource(el);
          const an = actx.createAnalyser();
          an.fftSize = 512;
          src.connect(an);
          an.connect(actx.destination);
          window.dispatchEvent(new CustomEvent("sama:analyser", { detail: an }));
          setPhase("speaking");
        },
      };

      await room.connect(url, token, {
        onRemoteAudio: cbRef.current.onRemoteAudio,
        onRemoteDisconnected: () => setPhase("listening"),
        onError: () => setPhase("idle"),
      });
      setConnected(true);

      // VAD Silero (client, ADR-004) — barge-in + segmentation réelle
      const vad = createMicVad();
      vadRef.current = vad;
      await vad.start(stream, {
        onSpeechStart: () => {
          room.send({ type: "barge_in" });
          setPhase("listening");
          setActive(true);
        },
        onSpeechEnd: (segment) => {
          const segmentId = startSegment();
          // Durée RÉELLE du segment (produit par le VAD, 16 kHz)
          const durationMs = Math.round((segment.length / 16_000) * 1000);
          room.send({ type: "user_segment", segmentId, durationMs });
          endSegment();
          setPhase("thinking");
        },
      });
    } catch (err) {
      console.error("voice start failed", err);
      setPhase("idle");
      setFailed(true); // fallback texte honnête (§120)
    }
  }, [setPhase, setConnected, setActive, startSegment, endSegment, tokenQuery]);

  const cancel = useCallback(async () => {
    const room = roomRef.current;
    if (room) {
      room.send({ type: "cancel" });
      room.stopAgentAudio();
      await room.disconnect();
      roomRef.current = null;
    }
    vadRef.current?.destroy();
    vadRef.current = null;
    mediaRef.current?.getTracks().forEach((t) => t.stop());
    mediaRef.current = null;
    setConnected(false);
    setActive(false);
    setPhase("idle");
    router.push("/app/home");
  }, [router, setConnected, setActive, setPhase]);

  useEffect(() => {
    start();
    return () => {
      vadRef.current?.destroy();
      mediaRef.current?.getTracks().forEach((t) => t.stop());
      roomRef.current?.disconnect();
      resetVoice();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const coreState: CoreState = PHASE_TO_CORE[phase] ?? "idle";

  return (
    <div className="flex min-h-[calc(100dvh-9rem)] flex-col items-center justify-center gap-8">
      {failed ? (
        <Card className="flex w-full max-w-sm flex-col items-center gap-4 p-8 text-center">
          <span aria-hidden className="text-4xl">
            🎙️
          </span>
          <h2 className="text-xl font-extrabold">Voix indisponible</h2>
          <p className="text-sm text-text2">
            Micro, VAD ou connexion LiveKit indisponibles. Vous pouvez continuer par écrit sans
            attendre.
          </p>
          <div className="flex w-full flex-col gap-2">
            <Button variant="gradient" size="lg" onClick={() => router.push("/app/home")}>
              Continuer par texte
            </Button>
            <Button variant="secondary" onClick={start}>
              Réessayer
            </Button>
          </div>
        </Card>
      ) : (
        <>
          <div className="flex flex-1 flex-col items-center justify-center gap-8 py-6">
            <VoiceCore state={coreState} size="xl" ariaLabel="Session vocale Sama Agent" />
            <PhaseHeader state={coreState} />
            {/* Transcript : n'affiche que du texte RÉEL côté client (aucune fabrication) */}
            <p
              aria-live="polite"
              className="min-h-[1.5rem] max-w-xl text-center text-base italic text-text2"
            >
              {coreState === "listening" ? "Je vous écoute…" : "\u00A0"}
            </p>
          </div>
          <CancelButton onCancel={cancel} />
        </>
      )}
    </div>
  );
}