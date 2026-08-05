"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

// Preferencia (por sección, en localStorage) de si las filas nuevas entran
// arriba o abajo del listado. `defaultNuevasArriba` debe reflejar el orden
// actual de esa sección para no sorprender al usuario la primera vez.
export function useOrdenEntrada(key: string, defaultNuevasArriba: boolean) {
  const [nuevasArriba, setNuevasArriba] = useState(defaultNuevasArriba);

  useEffect(() => {
    try {
      const v = localStorage.getItem(`orden-entrada:${key}`);
      if (v === "1" || v === "0") setNuevasArriba(v === "1");
    } catch {
      /* localStorage inaccesible */
    }
  }, [key]);

  const toggle = () =>
    setNuevasArriba((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(`orden-entrada:${key}`, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });

  return { nuevasArriba, toggle };
}

// Botón compacto para invertir el orden de entrada de las filas nuevas.
export function OrdenEntradaToggle({
  nuevasArriba,
  onToggle,
  className,
}: {
  nuevasArriba: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title="Dónde aparecen las filas nuevas (arriba o abajo)"
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface2",
        className
      )}
    >
      {nuevasArriba ? (
        <ArrowUp size={15} className="text-accent" />
      ) : (
        <ArrowDown size={15} className="text-accent" />
      )}
      Nuevas {nuevasArriba ? "arriba" : "abajo"}
    </button>
  );
}
