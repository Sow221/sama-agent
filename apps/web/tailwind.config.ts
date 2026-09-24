import type { Config } from "tailwindcss";

/**
 * Thème Sama Agent — tokens issus du langage visuel du kit Echo AI,
 * adaptés Sénégal + accessibilité AA (voir panning/ui-kit-figma/etude-exploitation.md).
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        primary: "var(--primary)",
        "accent-ai": "var(--accent-ai)",
        warning: "var(--warning)",
        danger: "var(--danger)",
        text1: "var(--text-1)",
        text2: "var(--text-2)",
      },
      borderRadius: { card: "var(--radius-card)" },
      boxShadow: { glow: "var(--shadow-glow)" },
      fontFamily: { sans: ["var(--font-sans)", "system-ui", "sans-serif"] },
      animation: {
        "pulse-slow": "pulseSlow 3s ease-in-out infinite",
        "spin-slow": "spinSlow 6s linear infinite",
      },
      keyframes: {
        pulseSlow: {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.65", transform: "scale(0.98)" },
        },
        spinSlow: {
          from: { transform: "rotate(0deg)" },
          to: { transform: "rotate(360deg)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;