"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Columnas de tabla con ancho ajustable arrastrando el borde derecho de cada
// encabezado (estilo Salesforce). Los anchos se guardan en localStorage por
// tabla, así el usuario mantiene su layout entre sesiones.
//
// Rendimiento: durante el arrastre NO tocamos el estado de React (eso
// re-renderizaría toda la tabla en cada pixel → laggeo con muchas filas).
// Mutamos el ancho del <col> y de la <table> directamente por DOM, y recién al
// soltar hacemos un único setState + persistimos. Así el drag es instantáneo
// sin importar cuántas filas tenga la tabla.
//
// Uso:
//   const cols = useResizableColumns("cuentas", [56, 460, 190, 210, 120]);
//   <table {...cols.tableProps} className="text-sm ...">
//     <colgroup>{cols.colgroup}</colgroup>
//     <thead><tr className="... [&_th]:relative">
//       <th>#{cols.handle(0)}</th> ...
export function useResizableColumns(storageKey: string, defaults: number[]) {
  const [widths, setWidths] = useState<number[]>(defaults);
  const key = `colw:${storageKey}`;

  // Espejo mutable de los anchos actuales: se actualiza en vivo durante el drag
  // sin provocar renders. `widths` (estado) solo cambia al soltar / resetear.
  const live = useRef<number[]>(defaults.slice());
  const colRefs = useRef<(HTMLTableColElement | null)[]>([]);
  const tableRef = useRef<HTMLTableElement | null>(null);

  // Cargar los anchos guardados una vez montado (en efecto, no en render, para
  // no romper la hidratación del SSR).
  useEffect(() => {
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
          setWidths(saved as number[]);
        }
      }
    } catch {
      /* localStorage inaccesible: usamos los defaults */
    }
    // Solo al montar / cambiar de tabla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const drag = useRef<{ index: number; startX: number; startW: number } | null>(null);

  // Aplica un ancho por DOM (sin render): muta el <col> y el ancho total de la
  // tabla para que el scroll horizontal siga a la suma.
  const applyWidth = (index: number, w: number) => {
    live.current[index] = w;
    const col = colRefs.current[index];
    if (col) col.style.width = `${w}px`;
    const table = tableRef.current;
    if (table) {
      table.style.width = `${live.current.reduce((a, b) => a + b, 0)}px`;
    }
  };

  const onPointerDown = useCallback(
    (index: number) => (e: React.PointerEvent<HTMLSpanElement>) => {
      e.preventDefault();
      e.stopPropagation();
      drag.current = { index, startX: e.clientX, startW: live.current[index] ?? 120 };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    []
  );

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLSpanElement>) => {
    if (!drag.current) return;
    const { index, startX, startW } = drag.current;
    const next = Math.max(48, Math.round(startW + (e.clientX - startX)));
    applyWidth(index, next);
  }, []);

  const commit = useCallback(() => {
    try {
      localStorage.setItem(key, JSON.stringify(live.current));
    } catch {
      /* ignore */
    }
    setWidths(live.current.slice());
  }, [key]);

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLSpanElement>) => {
      if (!drag.current) return;
      e.currentTarget.releasePointerCapture?.(e.pointerId);
      drag.current = null;
      commit();
    },
    [commit]
  );

  // Doble click en el borde: reinicia esa columna a su ancho por defecto.
  const onDoubleClick = useCallback(
    (index: number) => () => {
      applyWidth(index, defaults[index]);
      commit();
    },
    // applyWidth es estable (usa refs); defaults/commit son las dependencias reales.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [defaults, commit]
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

  const total = widths.reduce((a, b) => a + b, 0);

  const colgroup = widths.map((w, i) => (
    <col
      key={i}
      ref={(el) => {
        colRefs.current[i] = el;
      }}
      style={{ width: w }}
    />
  ));

  const tableProps = {
    ref: tableRef,
    style: {
      tableLayout: "fixed",
      width: total,
      minWidth: "100%",
    } as React.CSSProperties,
  };

  return { widths, handle, colgroup, tableProps };
}
