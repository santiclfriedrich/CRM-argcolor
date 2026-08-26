"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";

type ModalSize = "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl" | "5xl" | "6xl" | "7xl";

const SIZE: Record<ModalSize, string> = {
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
  "4xl": "max-w-4xl",
  "5xl": "max-w-5xl",
  "6xl": "max-w-6xl",
  "7xl": "max-w-7xl",
};

// El motivo del cierre permite decidir, por ejemplo, si se descarta un borrador:
// "x"/"escape" = cierre intencional; "backdrop" = clic afuera (posible accidente).
type CloseReason = "x" | "backdrop" | "escape";

interface ModalProps {
  open: boolean;
  onClose: (reason?: CloseReason) => void;
  title: string;
  children: ReactNode;
  size?: ModalSize;
}

// Diálogo modal liviano basado en estado (sin Radix). Cierra con Escape o con un
// clic en el fondo. Para no perder datos por accidente, el clic del fondo solo
// cierra si empezó Y terminó ahí (no cuando arrastrás una selección desde adentro
// y soltás afuera).
export function Modal({ open, onClose, title, children, size = "lg" }: ModalProps) {
  const pressStartedOnBackdrop = useRef(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose("escape");
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  // Portal al body: así el modal cubre toda la pantalla aunque un ancestro tenga
  // transform (que si no, "atrapa" al position:fixed y lo achica).
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => {
        pressStartedOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        // Solo cierra si el gesto empezó y terminó en el fondo (no un arrastre
        // que arrancó dentro de un campo).
        if (e.target === e.currentTarget && pressStartedOnBackdrop.current) {
          onClose("backdrop");
        }
      }}
      role="presentation"
    >
      <div
        className={`flex max-h-[85vh] w-full flex-col overflow-hidden rounded-2xl bg-surface shadow-soft ring-1 ring-line ${SIZE[size]}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="relative flex shrink-0 items-center justify-center border-b border-line px-12 py-3.5">
          <h2 className="text-center text-lg font-bold text-ink">{title}</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onClose("x")}
            aria-label="Cerrar"
            // Centrado vertical por margen automático (sin transform), y sin
            // desplazamiento al presionar: antes `active:translate-y-px` pisaba el
            // `-translate-y-1/2` de centrado y la X "saltaba", dificultando el clic.
            className="absolute right-3 inset-y-0 my-auto active:translate-y-0"
          >
            <X size={18} />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
