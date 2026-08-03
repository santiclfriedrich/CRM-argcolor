import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      colors: {
        // Paleta base ARG COLOR: violeta de marca (#7118f7).
        brand: {
          DEFAULT: "#7118f7",
          light: "#a37cff",
          dark: "#5e14cd",
          50: "#f3ecfe",
          100: "#e4d3fd",
        },
        // Tokens semánticos: cambian solos entre claro/oscuro (ver globals.css).
        bg: "var(--c-bg)",
        surface: "var(--c-surface)",
        surface2: "var(--c-surface-2)",
        surface3: "var(--c-surface-3)",
        line: "var(--c-line)",
        ink: {
          DEFAULT: "var(--c-ink)",
          2: "var(--c-ink-2)",
          3: "var(--c-ink-3)",
        },
        accent: {
          DEFAULT: "rgb(var(--c-accent) / <alpha-value>)",
          dim: "var(--c-accent-dim)",
          hover: "rgb(var(--c-accent-hover) / <alpha-value>)",
        },
        navy: {
          DEFAULT: "var(--c-navy)",
          hover: "var(--c-navy-hover)",
        },
        muted: "var(--c-muted)",
        // Semánticos de estado: soportan modificadores de opacidad
        // (text-danger, bg-warning/12, border-success/40…).
        success: "rgb(var(--c-success) / <alpha-value>)",
        warning: "rgb(var(--c-warning) / <alpha-value>)",
        danger: "rgb(var(--c-danger) / <alpha-value>)",
        info: "rgb(var(--c-info) / <alpha-value>)",
        neutral: "rgb(var(--c-neutral) / <alpha-value>)",
      },
      boxShadow: {
        // Sombras suaves para dar profundidad a cards y modales.
        soft: "0 1px 2px rgba(3,35,77,0.04), 0 10px 24px -14px rgba(3,35,77,0.22)",
        pop: "0 1px 2px rgba(113,24,247,0.15), 0 8px 20px -8px rgba(113,24,247,0.35)",
      },
    },
  },
  plugins: [],
};

export default config;
