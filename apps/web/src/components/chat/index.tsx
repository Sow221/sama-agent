"use client";

import type { MessageRole } from "@/lib/state/stores";

/** Bulles de conversation (G11) : agent à gauche, utilisateur à droite. */
export function MessageBubble({
  role,
  text,
}: {
  role: MessageRole;
  text: string;
}) {
  const isAgent = role === "agent";
  return (
    <div className={`flex ${isAgent ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[78%] rounded-2xl px-4 py-3 text-base ${
          isAgent
            ? "rounded-bl-sm bg-surface border border-surface-2 text-text1"
            : "rounded-br-sm bg-primary/15 border border-primary/30 text-text1"
        }`}
      >
        {text}
      </div>
    </div>
  );
}

/** Pendant « J'analyse… » : bulle avec trois points animés. */
export function ThinkingOverlay() {
  return (
    <div className="flex justify-start">
      <div className="rounded-2xl rounded-bl-sm bg-surface border border-surface-2 px-4 py-3">
        <span className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-2 w-2 animate-bounce rounded-full bg-primary"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </span>
      </div>
    </div>
  );
}