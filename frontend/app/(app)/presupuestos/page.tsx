"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { Building2, FileText, Plus, Target, Trash2, UploadCloud, User } from "lucide-react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefChip } from "@/components/ui/ref-chip";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  OrdenEntradaToggle,
  useOrdenEntrada,
} from "@/components/ui/orden-entrada";
import { useResizableColumns } from "@/components/ui/resizable-columns";
import { useSeccion } from "@/components/ui/seccion";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import {
  abrirPdf,
  ESTADO_CARGA_GBP,
  ESTADO_PRESUPUESTO,
  fmtMonto,
  nombreSucursal,
  useCargarGrupoEnGbp,
  useDeletePresupuesto,
  usePresupuestos,
  useReencolarParte,
  useSucursales,
} from "@/lib/presupuestos";
import type { EstadoPresupuesto, Presupuesto } from "@/lib/types";
import { errorMessage } from "@/lib/utils";

import { CrearPresupuestoModal } from "./crear-modal";

const TONO_PRESUPUESTO = {
  borrador: "neutral",
  enviado: "info",
  aceptado: "success",
  rechazado: "danger",
  negociando: "warning",
} as const satisfies Record<EstadoPresupuesto, string>;

export default function PresupuestosPage() {
  const { seccion } = useSeccion();
  const { data, isLoading, isError } = usePresupuestos(
    undefined,
    undefined,
    seccion
  );
  const deleteMut = useDeletePresupuesto();
  const cargarGrupo = useCargarGrupoEnGbp();
  const reencolar = useReencolarParte();
  const sucursales = useSucursales();
  const confirm = useConfirm();
  const { toast } = useToast();
  const [crearOpen, setCrearOpen] = useState(false);

  // Cuántas partes tiene cada lote (para mostrar "Parte i/N").
  const partesPorGrupo: Record<string, number> = {};
  for (const p of data ?? []) {
    if (p.gbp_grupo) partesPorGrupo[p.gbp_grupo] = (partesPorGrupo[p.gbp_grupo] ?? 0) + 1;
  }

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

  // Orden de entrada (default: nuevas arriba, como viene del backend id desc).
  const { nuevasArriba, toggle: toggleOrden } = useOrdenEntrada(
    "presupuestos",
    true
  );
  const filas = [...visibles].sort((a, b) =>
    nuevasArriba ? b.id - a.id : a.id - b.id
  );

  // Columnas de ancho ajustable (Código, Oportunidad, Cliente, Total, Estado,
  // Creado por, acciones).
  const cols = useResizableColumns(
    "presupuestos",
    [150, 260, 260, 150, 130, 200, 150]
  );

  // Virtualización: solo se montan las filas visibles.
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: filas.length,
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

  const reencolarParte = async (p: Presupuesto) => {
    if (p.estado_carga === "revisar") {
      const ok = await confirm({
        title: "Reencolar parte",
        message:
          "Esta parte pudo haber quedado guardada en GBP. Verificá en GBP antes: " +
          "reencolar puede duplicar el presupuesto. ¿Reencolar igual?",
        danger: true,
      });
      if (!ok) return;
    }
    reencolar.mutate(
      { id: p.id, confirmar: p.estado_carga === "revisar" },
      { onError: (e) => toast(errorMessage(e), "error") }
    );
  };

  return (
    <div className="flex h-full flex-col">
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
            {visibles.length}{" "}
            {visibles.length === 1 ? "presupuesto" : "presupuestos"}
          </p>
          <div className="ml-auto flex items-center gap-2">
            <Button onClick={() => setCrearOpen(true)}>
              <Plus size={16} /> Crear nuevo presupuesto
            </Button>
            <OrdenEntradaToggle
              nuevasArriba={nuevasArriba}
              onToggle={toggleOrden}
            />
          </div>
        </div>
      )}

      {crearOpen && <CrearPresupuestoModal onClose={() => setCrearOpen(false)} />}

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
                <th>Estado{cols.handle(4)}</th>
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
                  <td
                    colSpan={7}
                    className="border-0 p-0"
                    style={{ height: padTop }}
                  />
                </tr>
              )}
              {vItems.map((vi) => {
                const p = filas[vi.index];
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
                      {p.gbp_grupo && p.gbp_parte != null && (
                        <span className="ml-2 rounded bg-surface2 px-1.5 py-0.5 text-xs text-ink-2">
                          Parte {p.gbp_parte}/{partesPorGrupo[p.gbp_grupo] ?? "?"}
                        </span>
                      )}
                    </td>
                    <td className="truncate px-3 py-2">
                      {p.oportunidad_id != null ? (
                        <Link
                          href={`/oportunidades?op=${p.oportunidad_id}`}
                          className="inline-flex max-w-full"
                        >
                          <RefChip
                            icon={
                              <Target size={12} className="shrink-0 text-ink-3" />
                            }
                          >
                            {p.oportunidad?.asunto ??
                              `Oportunidad ${p.oportunidad_id}`}
                          </RefChip>
                        </Link>
                      ) : (
                        <span className="text-ink-3">—</span>
                      )}
                    </td>
                    <td className="truncate px-3 py-2">
                      {p.oportunidad?.cliente?.razon_social ? (
                        <RefChip
                          icon={
                            <Building2
                              size={12}
                              className="shrink-0 text-ink-3"
                            />
                          }
                        >
                          {p.oportunidad.cliente.razon_social}
                        </RefChip>
                      ) : p.cliente_numero ? (
                        <RefChip
                          icon={
                            <Building2 size={12} className="shrink-0 text-ink-3" />
                          }
                        >
                          Cliente N° {p.cliente_numero}
                        </RefChip>
                      ) : (
                        <span className="text-ink-3">—</span>
                      )}
                      <div className="mt-0.5 text-xs text-ink-3">
                        {nombreSucursal(sucursales, p.sucursal)}
                      </div>
                    </td>
                    <td className="truncate px-3 py-2 tabular-nums text-ink">
                      {p.totales_por_moneda &&
                      Object.keys(p.totales_por_moneda).length > 0
                        ? Object.entries(p.totales_por_moneda).map(([m, t]) => (
                            <div key={m}>{fmtMonto(Number(t), m)}</div>
                          ))
                        : fmtMonto(p.monto_total, p.moneda)}
                    </td>
                    <td className="truncate px-3 py-2">
                      <div className="flex flex-col items-start gap-1">
                        <Badge tone={TONO_PRESUPUESTO[p.estado]}>
                          {ESTADO_PRESUPUESTO[p.estado].label}
                        </Badge>
                        {p.estado_carga && (
                          <Badge tone={ESTADO_CARGA_GBP[p.estado_carga].tono}>
                            {ESTADO_CARGA_GBP[p.estado_carga].label}
                            {p.id_gbp_pedido ? ` · ${p.id_gbp_pedido}` : ""}
                          </Badge>
                        )}
                        {(p.estado_carga === "error" ||
                          p.estado_carga === "revisar" ||
                          p.estado_carga === "cancelado") &&
                          p.gbp_error && (
                            <span className="max-w-[16rem] whitespace-normal text-xs text-ink-2">
                              {p.gbp_error}
                            </span>
                          )}
                      </div>
                    </td>
                    <td className="truncate px-3 py-2">
                      {p.creado_por?.nombre ? (
                        <RefChip
                          icon={
                            <User size={12} className="shrink-0 text-ink-3" />
                          }
                        >
                          {p.creado_por.nombre}
                        </RefChip>
                      ) : (
                        <span className="text-ink-3">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        {p.gbp_grupo &&
                          p.gbp_parte === 1 &&
                          !p.estado_carga && (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={cargarGrupo.isPending}
                              onClick={() =>
                                cargarGrupo.mutate(p.gbp_grupo as string, {
                                  onSuccess: (r) =>
                                    toast(
                                      `${r.length} partes enviadas a GBP`,
                                      "success"
                                    ),
                                  onError: (e) => toast(errorMessage(e), "error"),
                                })
                              }
                            >
                              <UploadCloud size={14} /> Cargar grupo
                            </Button>
                          )}
                        {(p.estado_carga === "error" ||
                          p.estado_carga === "prueba" ||
                          p.estado_carga === "revisar") && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={reencolar.isPending}
                            onClick={() => reencolarParte(p)}
                          >
                            <UploadCloud size={14} /> Reencolar
                          </Button>
                        )}
                        {p.estado_carga === "cargado" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => abrirPdf(p.id)}
                          >
                            <FileText size={14} /> PDF
                          </Button>
                        )}
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
                  <td
                    colSpan={7}
                    className="border-0 p-0"
                    style={{ height: padBottom }}
                  />
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
