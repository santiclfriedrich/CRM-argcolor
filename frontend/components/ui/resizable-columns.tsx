"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

// useLayoutEffect avisa en SSR; en el server usamos useEffect (no corre igual).
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

// Columnas de tabla con ancho ajustable arrastrando el borde derecho de cada
// encabezado (estilo Salesforce). Los anchos se guardan en localStorage por
// tabla, así el usuario mantiene su layout entre sesiones.
//
// Rendimiento: el ancho de las columnas es 100% imperativo (DOM). Un resize
// NUNCA dispara un render de React — sería carísimo con tablas de miles de
// filas (era el pico de ~1.7s que medía el INP). Durante el arrastre solo
// mutamos el style de los <col> y de la <table>; al soltar persistimos a
// localStorage. React solo maneja qué columnas existen, no su ancho.
//
// Uso:
//   const cols = useResizableColumns("cuentas", [56, 460, 190, 210, 120]);
//   <table {...cols.tableProps} className="text-sm ...">
//     <colgroup>{cols.colgroup}</colgroup>
//     <thead><tr className="... [&_th]:relative">
//       <th>#{cols.handle(0)}</th> ...
export function useResizableColumns(storageKey: string, defaults: number[]) {
  const key = `colw:${storageKey}`;

  // Anchos actuales (fuente de verdad, fuera de React). Arranca en defaults y se
  // reemplaza con lo guardado en el primer layout effect.
  const live = useRef<number[]>(defaults.slice());
  const colRefs = useRef<(HTMLTableColElement | null)[]>([]);
  const tableRef = useRef<HTMLTableElement | null>(null);
  const cargado = useRef(false);

  // Escribe los anchos actuales en el DOM (sin render): cada <col> y el ancho
  // total de la tabla, para que el scroll horizontal siga a la suma.
  const paint = useCallback(() => {
    const arr = live.current;
    let total = 0;
    for (let i = 0; i < arr.length; i++) {
      total += arr[i];
      const col = colRefs.current[i];
      if (col) col.style.width = `${arr[i]}px`;
    }
    if (tableRef.current) tableRef.current.style.width = `${total}px`;
  }, []);

  const persist = useCallback(() => {
    try {
      localStorage.setItem(key, JSON.stringify(live.current));
    } catch {
      /* localStorage inaccesible */
    }
  }, [key]);

  // Después de cada render (barato: ~5 escrituras de style): reaplica los anchos
  // al DOM. La primera vez además carga lo guardado. Corre antes del paint del
  // navegador, así no hay parpadeo en la carga.
  useIsoLayoutEffect(() => {
    if (!cargado.current) {
      cargado.current = true;
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const saved = JSON.parse(raw) as unknown;
          if (
            Array.isArray(saved) &&
            saved.length === defaults.length &&
            saved.every((n) => typeof n === "number" && n > 0)
          ) {
            live.current = (saved as number[]).slice();
          }
        }
      } catch {
        /* usamos defaults */
      }
    }
    paint();
  });

  const drag = useRef<{ index: number; startX: number; startW: number } | null>(null);

  const onPointerDown = useCallback(
    (index: number) => (e: React.PointerEvent<HTMLSpanElement>) => {
      e.preventDefault();
      e.stopPropagation();
      drag.current = { index, startX: e.clientX, startW: live.current[index] ?? 120 };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    []
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLSpanElement>) => {
      if (!drag.current) return;
      const { index, startX, startW } = drag.current;
      live.current[index] = Math.max(48, Math.round(startW + (e.clientX - startX)));
      paint(); // solo DOM, sin render
    },
    [paint]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLSpanElement>) => {
      if (!drag.current) return;
      e.currentTarget.releasePointerCapture?.(e.pointerId);
      drag.current = null;
      persist();
    },
    [persist]
  );

  // Doble click en el borde: reinicia esa columna a su ancho por defecto.
  const onDoubleClick = useCallback(
    (index: number) => () => {
      live.current[index] = defaults[index];
      paint();
      persist();
    },
    // defaults es estable (mismo literal en cada render del caller).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [paint, persist]
  );

  // Manija a renderizar dentro de cada <th> (que debe ser position: relative).
  const handle = (index: number) => (
    <span
      role="separator"
      aria-orientation="vertical"
      onPointerDown={onPointerDown(index)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={onDoubleClick(index)}
      className="absolute right-0 top-0 z-10 h-full w-2 translate-x-1/2 cursor-col-resize touch-none select-none hover:bg-accent/40"
    />
  );

  // Los <col> no llevan width en el prop: React no maneja su ancho (si lo
  // hiciera, un re-render por datos lo pisaría). El ancho lo pone paint().
  const colgroup = defaults.map((_, i) => (
    <col
      key={i}
      ref={(el) => {
        colRefs.current[i] = el;
      }}
    />
  ));

  const tableProps = {
    ref: tableRef,
    style: {
      tableLayout: "fixed",
      minWidth: "100%",
    } as React.CSSProperties,
  };

  return { handle, colgroup, tableProps };
}
