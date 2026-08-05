"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

// useLayoutEffect avisa en SSR; en el server usamos useEffect (no corre igual).
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

// Contenedor scrolleable más cercano (para anclar la línea guía a la parte
// visible de la tabla, no al <table> entero que con virtualización mide miles
// de px de alto).
function scrollParent(el: HTMLElement | null): HTMLElement | null {
  let n = el?.parentElement ?? null;
  while (n) {
    const oy = getComputedStyle(n).overflowY;
    if (oy === "auto" || oy === "scroll") return n;
    n = n.parentElement;
  }
  return el?.parentElement ?? null;
}

// Columnas de tabla con ancho ajustable arrastrando el borde derecho de cada
// encabezado (estilo Salesforce). Los anchos se guardan en localStorage por
// tabla, así el usuario mantiene su layout entre sesiones.
//
// Rendimiento: el ancho de las columnas es 100% imperativo (DOM). Un resize
// NUNCA dispara un render de React. Además, durante el arrastre NO tocamos la
// tabla real: con table-layout:fixed cambiar el ancho de una columna reflowea
// todas las filas (miles) en cada pixel → bloqueaba el hilo ~1s. En su lugar
// mostramos una línea guía vertical que sigue al cursor (solo transform, puro
// compositor, cero reflow) y aplicamos el ancho real UNA sola vez al soltar.
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
  const guia = useRef<HTMLDivElement | null>(null);

  const quitarGuia = () => {
    guia.current?.remove();
    guia.current = null;
  };

  const onPointerDown = useCallback(
    (index: number) => (e: React.PointerEvent<HTMLSpanElement>) => {
      e.preventDefault();
      e.stopPropagation();
      drag.current = { index, startX: e.clientX, startW: live.current[index] ?? 120 };
      e.currentTarget.setPointerCapture(e.pointerId);

      // Línea guía vertical anclada a la parte VISIBLE de la tabla (el contenedor
      // con scroll), no al <table> entero. Se mueve por transform durante el
      // drag; no toca la tabla ni provoca reflow.
      const cont = scrollParent(tableRef.current);
      const rect = (cont ?? tableRef.current)?.getBoundingClientRect();
      const top = rect ? Math.max(rect.top, 0) : 0;
      const bottom = rect ? Math.min(rect.bottom, window.innerHeight) : window.innerHeight;
      const g = document.createElement("div");
      g.className = "pointer-events-none fixed z-[9999] w-0.5 bg-accent";
      g.style.left = `${e.clientX}px`;
      g.style.top = `${top}px`;
      g.style.height = `${Math.max(0, bottom - top)}px`;
      document.body.appendChild(g);
      quitarGuia();
      guia.current = g;
    },
    []
  );

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLSpanElement>) => {
    if (!drag.current) return;
    const { index, startX, startW } = drag.current;
    const next = Math.max(48, Math.round(startW + (e.clientX - startX)));
    live.current[index] = next; // guardamos, pero NO repintamos la tabla
    if (guia.current) guia.current.style.transform = `translateX(${next - startW}px)`;
  }, []);

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLSpanElement>) => {
      if (!drag.current) return;
      e.currentTarget.releasePointerCapture?.(e.pointerId);
      drag.current = null;
      quitarGuia();
      paint(); // único reflow, con el ancho final
      persist();
    },
    [paint, persist]
  );

  const onPointerCancel = useCallback(
    (e: React.PointerEvent<HTMLSpanElement>) => {
      if (!drag.current) return;
      e.currentTarget.releasePointerCapture?.(e.pointerId);
      drag.current = null;
      quitarGuia();
      paint();
      persist();
    },
    [paint, persist]
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
      onPointerCancel={onPointerCancel}
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

  // La tabla mide EXACTAMENTE la suma de anchos (la setea paint()). Sin
  // min-width:100%: si pusiéramos 100%, con la suma < contenedor el layout
  // fixed reparte el sobrante entre columnas e ignora los anchos exactos (el
  // resize no se notaría y quedaban huecos). Si la suma < contenedor queda
  // espacio a la derecha, como en Salesforce.
  const tableProps = {
    ref: tableRef,
    style: {
      tableLayout: "fixed",
    } as React.CSSProperties,
  };

  return { handle, colgroup, tableProps };
}
