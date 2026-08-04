import { type HTMLAttributes, type ReactNode } from "react";

import { cn } from "@/lib/utils";

// Chip de referencia a otra entidad (cuenta, persona, oportunidad): pill con
// borde suave, como las referencias en las tablas de Pipedrive. Se adapta al
// tema por tokens (border-line/surface/ink-2).
export function RefChip({
  icon,
  className,
  children,
  ...props
}: { icon?: ReactNode } & HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-1 text-xs font-medium text-ink-2",
        className
      )}
      {...props}
    >
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}
