"use client";

/** Bouton micro du langage visuel (accueil) — ouvre l'écran Voice plein écran. */
import { Mic } from "@/components/icons";

export function VoiceButton({
  onPress,
  disabled,
}: {
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled}
      aria-label="Parler à Sama Agent"
      onPointerDown={(e) => {
        e.currentTarget.style.transform = "scale(0.95)";
        if ("vibrate" in navigator) navigator.vibrate(10);
      }}
      onPointerUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
      className="focus-visible flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary via-primary to-accent-ai text-[#11110f] shadow-glow transition-transform disabled:opacity-40"
    >
      <Mic className="h-7 w-7" />
    </button>
  );
}