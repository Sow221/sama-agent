import type { Config } from "tailwindcss";

/**
 * Thème Sama Agent — UI/UX Master Specification (v1.0).
 * Tous les tokens vivent dans globals.css — pour les couleurs, deux blocs
 * (`:root` = clair, `:root.dark` = sombre, même jeu de noms) ; Tailwind n'est
 * qu'un mapping.
 * Échelles de référence : spacing 2/4/8/12/16/20/24/32/40/48/64/80/96,
 * radius xs6 sm8 md12 lg16 xl20 2xl24, z-index §25, motion §86.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  // La classe `dark` est posée sur <html> par le script anti-flash
  // (app/layout.tsx) : c'est elle qui décide du thème, pas le réglage du
  // système — sans quoi `prefers-color-scheme` gagnerait sur le choix explicite.
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        "surface-elevated": "var(--surface-elevated)",
        "surface-hover": "var(--surface-hover)",
        band: "var(--band)",
        "header-bg": "var(--header-bg)",
        "bar-bg": "var(--bar-bg)",
        "bottom-nav-bg": "var(--bottom-nav-bg)",
        border: "var(--border)",
        "border-strong": "var(--border-strong)",
        primary: "rgb(var(--primary-rgb) / <alpha-value>)",
        "primary-soft": "var(--primary-soft)",
        "accent-ai": "rgb(var(--accent-ai-rgb) / <alpha-value>)",
        "accent-soft": "var(--accent-soft)",
        "on-primary": "var(--on-primary)",
        success: "rgb(var(--success-rgb) / <alpha-value>)",
        warning: "rgb(var(--warning-rgb) / <alpha-value>)",
        danger: "rgb(var(--danger-rgb) / <alpha-value>)",
        error: "rgb(var(--error-rgb) / <alpha-value>)",
        info: "rgb(var(--info-rgb) / <alpha-value>)",
        text1: "var(--text-1)",
        text2: "var(--text-2)",
        "text-muted": "var(--text-muted)",
        "text-disabled": "var(--text-disabled)",
      },
      borderRadius: {
        xs: "var(--radius-xs)",
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        "2xl": "var(--radius-2xl)",
        card: "var(--radius-card)",
      },
      boxShadow: {
        glow: "var(--shadow-glow)",
        elevated: "var(--shadow-elevated)",
      },
      zIndex: {
        content: "var(--z-content)",
        sticky: "var(--z-sticky)",
        header: "var(--z-header)",
        "bottom-nav": "var(--z-bottom-nav)",
        floating: "var(--z-floating)",
        voice: "var(--z-voice)",
        dropdown: "var(--z-dropdown)",
        drawer: "var(--z-drawer)",
        sheet: "var(--z-sheet)",
        modal: "var(--z-modal)",
        toast: "var(--z-toast)",
        system: "var(--z-system)",
      },
      transitionDuration: {
        instant: "var(--dur-instant)",
        micro: "var(--dur-micro)",
        ui: "var(--dur-ui)",
        modal: "var(--dur-modal)",
        core: "var(--dur-core)",
      },
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