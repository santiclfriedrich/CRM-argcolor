"use client";

import { ArrowDownWideNarrow, ArrowUpNarrowWide } from "lucide-react";
import { useEffect, useState } from "react";

import { useActualizarPreferencias, useMiUsuario } from "@/lib/usuarios";
import { cn } from "@/lib/utils";

// Preferencia (por usuario, en la base) de si las filas nuevas entran arriba o
// abajo del listado. Se guarda en `usuario.preferencias.orden_entrada[key]`, así
// acompaña a la cuenta en cualquier dispositivo. `defaultNuevasArriba` refleja
// el orden actual de esa sección para no sorprender la primera vez.
export function useOrdenEntrada(key: string, defaultNuevasArriba: boolean) {
  const { data: me } = useMiUsuario();
  const actualizar = useActualizarPreferencias();

  const ordenGuardado = (
    me?.preferencias as { orden_entrada?: Record<string, boolean> } | undefined
  )?.orden_entrada;
  const guardado = ordenGuardado?.[key];

  const [nuevasArriba, setNuevasArriba] = useState(defaultNuevasArriba);

  // Al cargar el usuario, adoptamos su preferencia guardada (si existe).
  useEffect(() => {
    if (typeof guardado === "boolean") setNuevasArriba(guardado);
  }, [guardado]);

  const toggle = () =>
    setNuevasArriba((prev) => {
      const next = !prev;
      actualizar.mutate({ orden_entrada: { ...(ordenGuardado ?? {}), [key]: next } });
      return next;
    });

  return { nuevasArriba, toggle };
}

// Botón de solo-ícono para invertir el orden de entrada. El ícono representa el
// sentido del orden (más nuevas primero / más viejas primero); el detalle va en
// el tooltip.
export function OrdenEntradaToggle({
  nuevasArriba,
  onToggle,
  className,
}: {
  nuevasArriba: boolean;
  onToggle: () => void;
  className?: string;
}) {
  const Icono = nuevasArriba ? ArrowDownWideNarrow : ArrowUpNarrowWide;
  const label = nuevasArriba ? "Más nuevas primero" : "Más viejas primero";
  return (
    <button
      type="button"
      onClick={onToggle}
      title={`Orden: ${label} (clic para invertir)`}
      aria-label={`Orden: ${label}`}
      className={cn(
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-accent transition-colors hover:bg-surface2",
        className
      )}
    >
      <Icono size={16} />
    </button>
  );
}
