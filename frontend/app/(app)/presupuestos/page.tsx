"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { Building2, FileText, Target, Trash2, User } from "lucide-react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefChip } from "@/components/ui/ref-chip";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useResizableColumns } from "@/components/ui/resizable-columns";
import { Tooltip } from "@/components/ui/tooltip";
import {
  abrirPdf,
  ESTADO_PRESUPUESTO,
  fmtMonto,
  useDeletePresupuesto,
  usePresupuestos,
} from "@/lib/presupuestos";
import type { EstadoPresupuesto, Presupuesto } from "@/lib/types";

const TONO_PRESUPUESTO = {
  borrador: "neutral",
  enviado: "info",
  aceptado: "success",
  rechazado: "danger",
  negociando: "warning",
} as const satisfies Record<EstadoPresupuesto, string>;

export default function PresupuestosPage() {
  const { data, isLoading, isError } = usePresupuestos();
  const deleteMut = useDeletePresupuesto();
  const confirm = useConfirm();

  const { data: session } = useSession();
  const currentUserId = Number(session?.usuario?.id) || null;
  const rol = (session?.usuario as { rol?: string } | undefined)?.rol;
  const [filtro, setFiltro] = useState<"mias" | "todas">(
    rol === "vendedor" ? "mias" : "todas"
  );
  // Default por rol: "mias" para vendedor, "todas" para admin/compras. Como `rol`
  // puede llegar undefined en el primer render, lo ajustamos una sola vez cuando
  // la sesión carga, sin pisar un cambio manual del usuario.
  const defaultToggleAplicado = useRef(false);
  useEffect(() => {
    if (!rol || defaultToggleAplicado.current) return;
    defaultToggleAplicado.current = true;
    setFiltro(rol === "vendedor" ? "mias" : "todas");
  }, [rol]);

  const visibles = (data ?? []).filter(
    (p) => filtro === "todas" || p.creado_por?.id === currentUserId
  );

  // Columnas de ancho ajustable (Código, Oportunidad, Cliente, Total, Estado,
  // Creado por, acciones).
  const cols = useResizableColumns("presupuestos", [150, 260, 260, 150, 130, 200, 90]);

  // Virtualización: solo se montan las filas visibles.
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: visibles.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 45,
    overscan: 12,
  });
  const vItems = rowVirtualizer.getVirtualItems();
  const padTop = vItems.length ? vItems[0].start : 0;
  const padBottom = vItems.length
    ? rowVirtualizer.getTotalSize() - vItems[vItems.length - 1].end
    : 0;

  const eliminar = async (p: Presupuesto) => {
    if (
      await confirm({
        title: "Eliminar presupuesto",
        message: `¿Eliminar el presupuesto ${p.codigo}? No se puede deshacer.`,
        danger: true,
      })
    ) {
      deleteMut.mutate(p.id);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">Presupuestos</h1>
        <p className="mt-1 text-sm text-ink-2">
          Cotizaciones armadas en el CRM. Para crear una nueva, entrá a una oportunidad y usá
          “Armar presupuesto”.
        </p>
      </div>

      {data && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-full border border-line bg-surface2 p-0.5 text-sm">
            {(["todas", "mias"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFiltro(f)}
                className={`rounded-full px-3 py-1 font-medium transition ${
                  filtro === f
                    ? "bg-navy text-white"
                    : "text-ink-2 hover:bg-surface"
                }`}
              >
                {f === "mias" ? "Mías" : "Todas"}
              </button>
            ))}
          </div>
          <p className="text-sm text-ink-2">
            {visibles.length} {visibles.length === 1 ? "presupuesto" : "presupuestos"}
          </p>
        </div>
      )}

      {isLoading && <p className="mt-4 text-ink-2">Cargando…</p>}
      {isError && <p className="mt-4 text-danger">No se pudo cargar.</p>}

      {data && (
        <div
          ref={scrollRef}
          className="mt-6 min-h-0 flex-1 overflow-auto rounded-2xl border border-line"
        >
          <table
            {...cols.tableProps}
            className="text-sm [&_td]:border-r [&_td]:border-line [&_th]:border-r [&_th]:border-line [&_td:last-child]:border-r-0 [&_th:last-child]:border-r-0"
          >
            <colgroup>{cols.colgroup}</colgroup>
            <thead>
              <tr className="[&_th]:relative [&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-surface2 [&_th]:px-3 [&_th]:py-2.5 [&_th]:text-left [&_th]:text-xs [&_th]:font-semibold [&_th]:text-ink [&_th]:shadow-[inset_0_-1px_0_var(--c-line)]">
                <th>
                  <span className="truncate">Código</span>
                  {cols.handle(0)}
                </th>
                <th>
                  <span className="truncate">Oportunidad</span>
                  {cols.handle(1)}
                </th>
                <th>
                  <span className="truncate">Cliente</span>
                  {cols.handle(2)}
                </th>
                <th>
                  <span className="truncate">Total</span>
                  {cols.handle(3)}
                </th>
                <th>
                  Estado{cols.handle(4)}
                </th>
                <th>
                  <span className="truncate">Creado por</span>
                  {cols.handle(5)}
                </th>
                <th>{cols.handle(6)}</th>
              </tr>
            </thead>
            <tbody>
              {padTop > 0 && (
                <tr aria-hidden>
                  <td colSpan={7} className="border-0 p-0" style={{ height: padTop }} />
                </tr>
              )}
              {vItems.map((vi) => {
                const p = visibles[vi.index];
                return (
                  <tr
                    key={p.id}
                    data-index={vi.index}
                    ref={rowVirtualizer.measureElement}
                    className="border-t border-line transition-colors hover:bg-surface2"
                  >
                    <td className="truncate px-3 py-2">
                      <Link
                        href={`/presupuestos/${p.id}`}
                        className="font-mono font-medium tabular-nums text-accent hover:underline"
                      >
                        {p.codigo}
                      </Link>
                    </td>
                    <td className="truncate px-3 py-2">
                      <Link href={`/oportunidades?op=${p.oportunidad_id}`} className="inline-flex max-w-full">
                        <RefChip icon={<Target size={12} className="shrink-0 text-ink-3" />}>
                          {p.oportunidad?.asunto ?? `Oportunidad ${p.oportunidad_id}`}
                        </RefChip>
                      </Link>
                    </td>
                    <td className="truncate px-3 py-2">
                      {p.oportunidad?.cliente?.razon_social ? (
                        <RefChip icon={<Building2 size={12} className="shrink-0 text-ink-3" />}>
                          {p.oportunidad.cliente.razon_social}
                        </RefChip>
                      ) : (
                        <span className="text-ink-3">—</span>
                      )}
                    </td>
                    <td className="truncate px-3 py-2 font-mono tabular-nums text-ink">
                      {fmtMonto(p.monto_total, p.moneda)}
                    </td>
                    <td className="truncate px-3 py-2">
                      <Badge tone={TONO_PRESUPUESTO[p.estado]}>
                        {ESTADO_PRESUPUESTO[p.estado].label}
                      </Badge>
                    </td>
                    <td className="truncate px-3 py-2">
                      {p.creado_por?.nombre ? (
                        <RefChip icon={<User size={12} className="shrink-0 text-ink-3" />}>
                          {p.creado_por.nombre}
                        </RefChip>
                      ) : (
                        <span className="text-ink-3">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => abrirPdf(p.id)}>
                          <FileText size={14} /> PDF
                        </Button>
                        <Tooltip label="Eliminar">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => eliminar(p)}
                            disabled={deleteMut.isPending}
                            aria-label="Eliminar"
                            className="text-ink-3 hover:text-danger"
                          >
                            <Trash2 size={14} />
                          </Button>
                        </Tooltip>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {padBottom > 0 && (
                <tr aria-hidden>
                  <td colSpan={7} className="border-0 p-0" style={{ height: padBottom }} />
                </tr>
              )}
              {visibles.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-ink-3">
                    {data.length > 0 && filtro === "mias"
                      ? "No tenés presupuestos creados. Cambiá a “Todas” para ver los del equipo."
                      : "Todavía no hay presupuestos."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
