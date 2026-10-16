import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

// Tooltip liviano (CSS puro) que aparece rápido al hacer hover, sin el delay
// del `title` nativo. Por defecto va en una línea arriba del contenido; con
// `wide` se alinea a la izquierda y envuelve en varias líneas (texto largo).
export function Tooltip({
  label,
  children,
  wide,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute bottom-full z-50 mb-1 rounded-lg bg-navy px-2 py-1 text-xs font-medium text-white opacity-0 shadow-md transition-opacity duration-100 group-hover:opacity-100",
          wide
            ? "left-0 max-w-[260px] whitespace-normal leading-snug"
            : "left-1/2 -translate-x-1/2 whitespace-nowrap"
        )}
      >
        {label}
      </span>
    </span>
  );
}
