"use client";

/**
 * Voice workspace — `/app/voice` (UI/UX Master Spec §30-32, §114, §117-120).
 * Chaîne TOUT réelle : LiveKit (WebRTC) → worker (détection de parole serveur →
 * Kiriku ASR → LLM NVIDIA → voix wolof Adia). Le navigateur ne fait que publier
 * son micro et jouer la voix : aucun VAD local (fragile sur mobile).
 * - Phases d'état pilotées par la session réelle (jamais devinées, §153).
 * - Fallback texte honnête si micro/LiveKit échouent (§120) — on ne bloque jamais.
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
  const audioCtxRef = useRef<AudioContext | null>(null);
  /** Le navigateur bloque le son tant que l'usager n'a pas touché l'écran. */
  const [soundBlocked, setSoundBlocked] = useState(false);
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
  const resetVoice = useVoiceStore((s) => s.reset);

  const tokenQuery = useVoiceToken();

  /** Animation du Core : niveau réel d'une piste (micro, puis voix de l'agent).
   * Purement visuel : si le contexte audio est suspendu, seule l'animation s'arrête. */
  const analyse = useCallback((track: MediaStreamTrack) => {
    try {
      const ctx = audioCtxRef.current ?? new AudioContext();
      audioCtxRef.current = ctx;
      void ctx.resume().catch(() => {});
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(new MediaStream([track])).connect(analyser);
      window.dispatchEvent(new CustomEvent("sama:analyser", { detail: analyser }));
    } catch {
      /* animation facultative */
    }
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
        if (!r.data) throw r.error ?? new Error("service vocal indisponible");
        return r.data;
      });

      const room = new VoiceRoom();
      roomRef.current = room;
      await room.connect(url, token, {
        onRemoteAudio: (_el, track) => analyse(track),
        onPlaybackBlocked: setSoundBlocked,
        onRemoteDisconnected: () => setPhase("listening"),
        onError: () => setPhase("idle"),
        /* La phase affichée vient du serveur (`agent_state`) : c'est lui qui
           détecte début et fin de parole, puis calcule et dit la réponse. */
        onAgentEvent: (event) => {
          if (event.type === "agent_state") {
            setPhase(event.state);
            if (event.state === "listening") setNotice(null);
            if (event.state === "thinking") {
              setHeard(null);
              setAgentReply(null);
            }
            return;
          }
          if (event.type === "agent_text") {
            if (event.role === "user") setHeard(event.text || null);
            else setAgentReply(event.text || null);
            return;
          }
          setNotice(agentErrorMessage(event.code));
          setPhase("listening");
        },
      });
      setConnected(true);
      setActive(true);
      setPhase("listening");
      const mic = room.micTrack();
      if (mic) analyse(mic);
    } catch (err) {
      console.error("voice start failed", err);
      setPhase("idle");
      setFailed(true); // fallback texte honnête (§120)
      setFailure(voiceFailure(err));
    }
  }, [setPhase, setConnected, setActive, tokenQuery, analyse]);

  /** Geste de l'usager : débloque le son (mobile) et l'animation. */
  const unlockSound = useCallback(async () => {
    await roomRef.current?.startAudio().catch(() => {});
    await audioCtxRef.current?.resume().catch(() => {});
    setSoundBlocked(false);
  }, []);

  const cancel = useCallback(async () => {
    const room = roomRef.current;
    if (room) {
      room.send({ type: "cancel" });
      room.stopAgentAudio();
      await room.disconnect();
      roomRef.current = null;
    }
    void audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setConnected(false);
    setActive(false);
    setPhase("idle");
    router.push("/app/home");
  }, [router, setConnected, setActive, setPhase]);

  useEffect(() => {
    start();
    return () => {
      void audioCtxRef.current?.close().catch(() => {});
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
            {soundBlocked ? (
              <Button variant="gradient" size="lg" onClick={unlockSound}>
                Activer le son
              </Button>
            ) : null}
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