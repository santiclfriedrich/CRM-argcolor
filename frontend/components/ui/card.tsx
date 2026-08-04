import Link from "next/link";
import { type HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

// Contenedor base de la app: radio, borde y sombra unificados.
// Reemplaza el patrón repetido `rounded-lg border border-line bg-surface shadow-sm`.
export function Card({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-line bg-surface shadow-soft",
        className
      )}
      {...props}
    />
  );
}

// Micro-etiqueta en mono/versalitas: la firma tipográfica del "instrumento
// comercial". Para kickers de card, encabezados de columna y rótulos de dato.
export function Kicker({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3",
        className
      )}
      {...props}
    />
  );
}

// CTA de pie de card: píldora con borde y texto violeta (estilo Pipedrive).
export function CardCta({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center justify-center rounded-full border border-line px-5 py-2 text-sm font-semibold text-accent transition-colors",
        "hover:border-accent hover:bg-accent-dim",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
        className
      )}
    >
      {children}
    </Link>
  );
}
