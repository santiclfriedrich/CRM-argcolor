import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Paleta base ARG COLOR (ajustable). Azul más vivo que el navy anterior.
        brand: {
          DEFAULT: "#2563eb", // blue-600
          light: "#60a5fa",
          dark: "#1d4ed8",
          50: "#eff6ff",
          100: "#dbeafe",
        },
      },
      boxShadow: {
        // Sombras suaves para dar profundidad a cards y modales.
        soft: "0 1px 2px rgba(15,23,42,0.04), 0 12px 28px -16px rgba(15,23,42,0.25)",
        pop: "0 1px 2px rgba(37,99,235,0.15), 0 8px 20px -8px rgba(37,99,235,0.35)",
      },
    },
  },
  plugins: [],
};

export default config;
