/**
 * Retrocompat : VoiceVisualizer == VoiceCore (un seul Core, §40).
 */
"use client";

export { VoiceCore as VoiceVisualizer } from "./VoiceCore";
export type { CoreState } from "./VoiceCore";