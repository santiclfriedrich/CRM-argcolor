import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      colors: {
        // Verde de acción de los botones primarios (CTA). Mode-aware por token.
        brand: {
          DEFAULT: "rgb(var(--c-brand) / <alpha-value>)",
          dark: "var(--c-brand-hover)",
        },
        // Chrome del nav / To-Do bar (violeta en claro, oscuro real en dark).
        nav: "var(--c-nav)",
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
      // Borde por defecto un poco más grueso (1.5px en vez de 1px): la retícula
      // —tablas, cards, campos, separadores— se siente más firme sin tocar las
      // ~167 clases `border-line`/`divide-line` de la app.
      borderWidth: {
        DEFAULT: "1.5px",
      },
      divideWidth: {
        DEFAULT: "1.5px",
      },
      boxShadow: {
        // Sombras suaves, teñidas de antracita (no de negro ni violeta) para el
        // look premium: ambientales, no jerárquicas.
        soft: "0 1px 2px rgba(14,19,22,0.05), 0 10px 24px -14px rgba(14,19,22,0.25)",
        pop: "0 1px 2px rgba(43,92,130,0.14), 0 8px 20px -8px rgba(43,92,130,0.30)",
      },
    },
  },
  plugins: [],
};

export default config;
