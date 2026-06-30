"use client";

import { Trash2 } from "lucide-react";
import { useSession } from "next-auth/react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { ESTADO_META, useDeleteOportunidad, useOportunidades } from "@/lib/oportunidades";
import {
  diasSinMovimiento,
  semaforoDe,
  SEMAFORO_META,
  SEMAFORO_ORDER,
  type Semaforo,
} from "@/lib/tablero";
import type { Oportunidad } from "@/lib/types";

type Filtro = "todas" | "mias";

export default function TableroPage() {
  const { data: session } = useSession();
  const currentUserId = Number(session?.usuario?.id) || null;
  const [filtro, setFiltro] = useState<Filtro>("todas");

  const { data, isLoading, isError } = useOportunidades();

  // Agrupa las oportunidades activas por semáforo (un único new Date por render).
  const { grupos, total } = useMemo(() => {
    const now = new Date();
    const base: Record<Semaforo, Oportunidad[]> = { rojo: [], amarillo: [], verde: [] };
    const visibles = (data ?? []).filter(
      (o) => filtro === "todas" || o.vendedor_id === currentUserId
    );
    for (const o of visibles) {
      const s = semaforoDe(o, now);
      if (s) base[s].push(o);
    }
    return { grupos: base, total: base.rojo.length + base.amarillo.length + base.verde.length };
  }, [data, filtro, currentUserId]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Tablero</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {total} oportunidad{total === 1 ? "" : "es"} en seguimiento
          </p>
        </div>
        <div className="flex rounded-md border border-slate-200 dark:border-slate-800 p-0.5 text-sm">
          {(["todas", "mias"] as Filtro[]).map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`rounded px-3 py-1 font-medium transition ${
                filtro === f ? "bg-brand text-white" : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              {f === "todas" ? "Todas" : "Mías"}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <p className="mt-6 text-slate-500 dark:text-slate-400">Cargando…</p>}
      {isError && (
        <p className="mt-6 text-red-600">
          No se pudo cargar. ¿El backend está corriendo en {process.env.NEXT_PUBLIC_API_URL}?
        </p>
      )}

      {data && (
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {SEMAFORO_ORDER.map((s) => {
            const meta = SEMAFORO_META[s];
            const items = grupos[s];
            return (
              <section key={s} className={`rounded-lg border ${meta.ring} bg-slate-50/50 dark:bg-slate-800/40`}>
                <header className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-4 py-3">
                  <span className={`flex items-center gap-2 font-semibold ${meta.header}`}>
                    <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />
                    {meta.label}
                  </span>
                  <Badge>{items.length}</Badge>
                </header>
                <div className="space-y-2 p-3">
                  {items.map((o) => (
                    <OportunidadCard key={o.id} oportunidad={o} />
                  ))}
                  {items.length === 0 && (
                    <p className="px-1 py-4 text-center text-xs text-slate-400 dark:text-slate-500">Sin oportunidades.</p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function OportunidadCard({ oportunidad: o }: { oportunidad: Oportunidad }) {
  const dias = diasSinMovimiento(o, new Date());
  const meta = ESTADO_META[o.estado];
  const deleteMut = useDeleteOportunidad();

  const eliminar = () => {
    const quien = o.cliente?.razon_social ?? `#${o.id}`;
    if (window.confirm(`¿Eliminar la oportunidad de ${quien}? Esta acción no se puede deshacer.`)) {
      deleteMut.mutate(o.id);
    }
  };

  return (
    <article className="group rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium text-slate-800 dark:text-slate-100">
          {o.cliente?.razon_social ?? "Sin cliente"}
        </span>
        <Badge className={meta.color}>{meta.label}</Badge>
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>{o.vendedor?.nombre ?? "Sin vendedor"}</span>
        <div className="flex items-center gap-2">
          <span>{dias === 0 ? "hoy" : `hace ${dias} día${dias === 1 ? "" : "s"}`}</span>
          <button
            type="button"
            onClick={eliminar}
            disabled={deleteMut.isPending}
            aria-label="Eliminar oportunidad"
            className="text-slate-300 transition hover:text-red-600 group-hover:text-slate-400"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </article>
  );
}
