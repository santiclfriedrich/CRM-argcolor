"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

// Toggle de tema claro/oscuro. El tema inicial lo aplica un script inline en
// el <head> (ver app/layout.tsx) para evitar parpadeo; acá solo lo cambiamos.
export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      /* localStorage puede no estar disponible; no es crítico */
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Cambiar tema"
      className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
    >
      {dark ? <Sun size={16} /> : <Moon size={16} />}
      {dark ? "Modo claro" : "Modo nocturno"}
    </button>
  );
}
