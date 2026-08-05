"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Columnas de tabla con ancho ajustable arrastrando el borde derecho de cada
// encabezado (estilo Salesforce). Los anchos se guardan en localStorage por
// tabla, así el usuario mantiene su layout entre sesiones.
//
// Uso:
//   const cols = useResizableColumns("cuentas", [48, 420, 180, 200, 120]);
//   <table style={cols.tableStyle} className="w-full ...">
//     <colgroup>{cols.colgroup}</colgroup>
//     <thead><tr className="... [&_th]:relative">
//       <th>#{cols.handle(0)}</th> ...
//
// El ancho de cada columna es fijo (px) y la tabla ocupa la suma total; si la
// suma supera el contenedor aparece scroll horizontal (el contenedor debe ser
// overflow-auto).
export function useResizableColumns(storageKey: string, defaults: number[]) {
  const [widths, setWidths] = useState<number[]>(defaults);
  const key = `colw:${storageKey}`;

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

  const onPointerDown = useCallback(
    (index: number) => (e: React.PointerEvent<HTMLSpanElement>) => {
      e.preventDefault();
      e.stopPropagation();
      drag.current = { index, startX: e.clientX, startW: widths[index] ?? 120 };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [widths]
  );

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLSpanElement>) => {
    if (!drag.current) return;
    const { index, startX, startW } = drag.current;
    const next = Math.max(48, Math.round(startW + (e.clientX - startX)));
    setWidths((prev) => {
      if (prev[index] === next) return prev;
      const copy = prev.slice();
      copy[index] = next;
      return copy;
    });
  }, []);

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLSpanElement>) => {
      if (!drag.current) return;
      e.currentTarget.releasePointerCapture?.(e.pointerId);
      drag.current = null;
      setWidths((w) => {
        try {
          localStorage.setItem(key, JSON.stringify(w));
        } catch {
          /* ignore */
        }
        return w;
      });
    },
    [key]
  );

  // Doble click en el borde: reinicia esa columna a su ancho por defecto.
  const onDoubleClick = useCallback(
    (index: number) => () => {
      setWidths((prev) => {
        const copy = prev.slice();
        copy[index] = defaults[index];
        try {
          localStorage.setItem(key, JSON.stringify(copy));
        } catch {
          /* ignore */
        }
        return copy;
      });
    },
    [defaults, key]
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

  const colgroup = widths.map((w, i) => <col key={i} style={{ width: w }} />);

  const tableStyle: React.CSSProperties = {
    tableLayout: "fixed",
    width: total,
    minWidth: "100%",
  };

  return { widths, handle, colgroup, tableStyle };
}
