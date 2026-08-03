import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { type HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

// Contenedor base de la app: radio, borde y sombra unificados.
// Reemplaza el patrón repetido `rounded-lg border border-line bg-surface shadow-sm`.
export function Card({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={cn(
        "rounded-xl border border-line bg-surface shadow-soft",
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

// CTA de pie de card: link limpio con flecha (reemplaza la píldora de borde
// negro). La flecha se desplaza en hover — micro-interacción discreta.
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
        "group inline-flex items-center gap-1.5 text-sm font-semibold text-accent transition-colors hover:text-accent-hover",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface rounded",
        className
      )}
    >
      {children}
      <ArrowRight
        size={15}
        className="transition-transform group-hover:translate-x-0.5"
      />
    </Link>
  );
}
