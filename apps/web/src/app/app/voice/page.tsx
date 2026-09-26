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
import { Mic } from "@/components/icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { VoiceCore, type CoreState } from "@/components/voice/VoiceCore";
import { PhaseHeader } from "@/components/voice/PhaseHeader";
import { CancelButton } from "@/components/voice/CancelButton";
import { Button, Card } from "@/components/ui";
import { useVoiceStore } from "@/lib/state/stores";
import { agentErrorMessage, voiceFailure, type VoiceFailure } from "@/lib/voice/messages";
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
  const [failure, setFailure] = useState<VoiceFailure | null>(null);
  /* Ce que le WORKER a réellement dit/reçu. Jamais deviné, jamais codé en dur. */
  const [agentReply, setAgentReply] = useState<string | null>(null);
  const [heard, setHeard] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
    setFailure(null);
    setAgentReply(null);
    setHeard(null);
    setNotice(null);
    try {
      const { url, token } = await tokenQuery.refetch().then((r) => {
        if (!r.data) {
          // 503 (clés LiveKit absentes) ou 409 (aucun dossier) : le serveur le dit,
          // on ne tente pas de deviner pourquoi en se connectant quand même.
          throw r.error ?? new Error("service vocal indisponible");
        }
        return r.data;
      });
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
        },
      };

      await room.connect(url, token, {
        onRemoteAudio: cbRef.current.onRemoteAudio,
        onRemoteDisconnected: () => setPhase("listening"),
        onError: () => setPhase("idle"),
        /* ── Le worker parle enfin au client ─────────────────────────────
           La phase affichée vient de `agent_state`, donc du serveur. Avant,
           elle était déduite localement d'événements VAD et ne pouvait pas
           distinguer « l'agent calcule » de « l'agent est coincé ». */
        onAgentEvent: (event) => {
          if (event.type === "agent_state") {
            setPhase(event.state);
            if (event.state === "listening") setNotice(null);
            return;
          }
          if (event.type === "agent_text") {
            // `role` vient du serveur : on ne devine pas qui parle.
            if (event.role === "user") setHeard(event.text || null);
            else setAgentReply(event.text || null);
            return;
          }
          // agent_error : dégradé honnête. Le message vient du serveur, avec son code.
          setNotice(agentErrorMessage(event.code));
          setPhase("listening");
        },
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
          // L'audio, lui, transite par la track micro publiée : cet événement ne
          // fait que dire « le segment est clos, traite-le ». (Le VAD local n'a pas
          // à réencoder : ce serait un doublon, et deux chemins audio divergent.)
          room.send({ type: "user_segment", segmentId, durationMs });
          endSegment();
          setPhase("thinking");
          setHeard(null);
          setAgentReply(null);
        },
      });
    } catch (err) {
      console.error("voice start failed", err);
      setPhase("idle");
      setFailed(true); // fallback texte honnête (§120)
      setFailure(voiceFailure(err));
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
          <span aria-hidden className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.05] text-accent-ai">
            <Mic className="h-8 w-8" />
          </span>
          <h1 className="text-xl font-extrabold">Voix indisponible</h1>
          {/* La cause réelle (serveur ou navigateur), traduite — jamais le texte technique. */}
          <p className="text-sm text-text2">
            {failure?.message ?? "La session vocale n'a pas pu démarrer."} Vous pouvez aussi
            continuer par écrit.
          </p>
          <div className="flex w-full flex-col gap-2">
            {failure?.remedy === "start_journey" ? (
              <Button variant="gradient" size="lg" onClick={() => router.push("/app/home")}>
                Commencer un parcours
              </Button>
            ) : (
              <Button variant="gradient" size="lg" onClick={() => router.push("/app/home")}>
                Continuer par écrit
              </Button>
            )}
            {failure?.remedy !== "start_journey" ? (
              <Button variant="secondary" onClick={start}>
                Réessayer
              </Button>
            ) : null}
          </div>
        </Card>
      ) : (
        <>
          <div className="flex flex-1 flex-col items-center justify-center gap-8 py-6">
            <h1 className="sr-only">Session vocale avec Sama Agent</h1>
            <VoiceCore state={coreState} size="xl" ariaLabel="Session vocale Sama Agent" />
            <PhaseHeader state={coreState} />
            {/* Ce qui suit vient du WORKER (agent_text) ou du serveur (agent_error).
                Aucune phrase en dur : tant qu'aucun texte réel n'est arrivé, on affiche
                une zone vide — pas un mensonge rassurant (« Je vous écoute… »). */}
            <div
              aria-live="polite"
              className="min-h-[3rem] w-full max-w-xl space-y-2 text-center"
            >
              {notice ? (
                <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-text2">{notice}</p>
              ) : null}
              {heard ? <p className="text-sm text-text2">Vous : {heard}</p> : null}
              {agentReply ? (
                <p className="text-base font-semibold text-text1">{agentReply}</p>
              ) : null}
            </div>
          </div>
          <CancelButton onCancel={cancel} />
        </>
      )}
    </div>
  );
}