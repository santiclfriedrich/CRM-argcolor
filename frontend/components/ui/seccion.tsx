"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import type { Seccion } from "@/lib/types";
import { useActualizarPreferencias, useMiUsuario } from "@/lib/usuarios";
import { cn } from "@/lib/utils";

// Sección activa del CRM (Corporativo / Gubernamental). Se guarda por usuario en
// `usuario.preferencias.seccion` (mismo mecanismo que orden_entrada), así se
// recuerda entre dispositivos. Todas las secciones ven ambas; el selector vive
// en el menú superior y scopea oportunidades, bandeja, propuestas, etc.
type SeccionCtx = { seccion: Seccion; setSeccion: (s: Seccion) => void };
const Ctx = createContext<SeccionCtx | null>(null);

export function SeccionProvider({ children }: { children: ReactNode }) {
  const { data: me } = useMiUsuario();
  const actualizar = useActualizarPreferencias();

  const guardada = (me?.preferencias as { seccion?: Seccion } | undefined)?.seccion;
  const [seccion, setSeccionState] = useState<Seccion>("corporativo");

  // Adoptamos la sección guardada del usuario cuando carga (si existe).
  useEffect(() => {
    if (guardada === "corporativo" || guardada === "gubernamental") {
      setSeccionState(guardada);
    }
  }, [guardada]);

  const setSeccion = (s: Seccion) => {
    setSeccionState(s);
    actualizar.mutate({ seccion: s });
  };

  return <Ctx.Provider value={{ seccion, setSeccion }}>{children}</Ctx.Provider>;
}

export function useSeccion(): SeccionCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSeccion debe usarse dentro de <SeccionProvider>");
  return ctx;
}

const OPCIONES: { value: Seccion; label: string }[] = [
  { value: "corporativo", label: "Corporativo" },
  { value: "gubernamental", label: "Gubernamental" },
];

// Selector de sección para el menú superior (fondo violeta): pill con el
// segmento activo en blanco.
export function SeccionSwitcher({ className }: { className?: string }) {
  const { seccion, setSeccion } = useSeccion();
  return (
    <div
      className={cn(
        "inline-flex shrink-0 rounded-full bg-white/10 p-0.5 text-xs font-medium",
        className
      )}
      role="group"
      aria-label="Sección"
    >
      {OPCIONES.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => setSeccion(o.value)}
          aria-pressed={seccion === o.value}
          className={cn(
            "rounded-full px-2.5 py-1 transition-colors",
            seccion === o.value
              ? "bg-white text-nav"
              : "text-white/70 hover:text-white"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
