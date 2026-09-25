"use client";

/**
 * Écran Realtime Voice (ADR-008) — plein écran.
 * Chaîne TOUT réelle : LiveKit (WebRTC) + VAD Silero WASM → worker (Kiriku ASR →
 * GLM → Journey → xTTS wolof). Aucune transcription affichée ; les états
 * « J'écoute… / J'analyse… / Je réponds… » pilotent l'orbe + anneaux au volume réel.
 */
import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { VoiceVisualizer } from "@/components/voice/VoiceVisualizer";
import { PhaseHeader } from "@/components/voice/PhaseHeader";
import { CancelButton } from "@/components/voice/CancelButton";
import { useVoiceStore } from "@/lib/state/stores";
import { VoiceRoom } from "@/lib/voice/livekit";
import { createMicVad, type SileroVad } from "@/lib/voice/vad";
import { useVoiceToken } from "@/lib/query/hooks";

export default function VoicePage() {
  const router = useRouter();
  const roomRef = useRef<VoiceRoom | null>(null);
  const vadRef = useRef<SileroVad | null>(null);
  const mediaRef = useRef<MediaStream | null>(null);
  const cbRef = useRef<{ onRemoteAudio: (el: HTMLAudioElement) => void } | null>(null);

  const setPhase = useVoiceStore((s) => s.setPhase);
  const setConnected = useVoiceStore((s) => s.setConnected);
  const setActive = useVoiceStore((s) => s.setActive);
  const startSegment = useVoiceStore((s) => s.startSegment);
  const endSegment = useVoiceStore((s) => s.endSegment);

  const tokenQuery = useVoiceToken();

  const takeMic = useCallback(async () => {
    if (mediaRef.current) return mediaRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRef.current = stream;
    return stream;
  }, []);

  const start = useCallback(async () => {
    setPhase("connecting");
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
          // La voix IA réelle : bascule l'analyseur sur la sortie pendant "Je réponds…"
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
    router.push("/app");
  }, [router, setConnected, setActive, setPhase]);

  useEffect(() => {
    start();
    return () => {
      vadRef.current?.destroy();
      mediaRef.current?.getTracks().forEach((t) => t.stop());
      roomRef.current?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-bg px-6 py-16">
      <div className="flex-1 flex flex-col items-center justify-center gap-8">
        <VoiceVisualizer />
        <PhaseHeader />
      </div>
      <CancelButton onCancel={cancel} />
    </div>
  );
}