import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Paleta base ARG COLOR (ajustable)
        brand: {
          DEFAULT: "#1e3a8a",
          light: "#3b82f6",
        },
      },
    },
  },
  plugins: [],
};

export default config;
