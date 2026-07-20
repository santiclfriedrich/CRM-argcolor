import type { ReactNode } from "react";

// Tooltip liviano (CSS puro) que aparece rápido al hacer hover, sin el delay
// del `title` nativo del navegador. Se posiciona arriba del contenido.
export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-navy px-2 py-1 text-xs font-medium text-white opacity-0 shadow-md transition-opacity duration-100 group-hover:opacity-100"
      >
        {label}
      </span>
    </span>
  );
}
