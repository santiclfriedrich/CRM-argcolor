"use client";

import { Building2, DollarSign, FileText, Hash, Target, Trash2, User } from "lucide-react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefChip } from "@/components/ui/ref-chip";
import { useConfirm } from "@/components/ui/confirm-dialog";
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
          <div className="inline-flex rounded-lg border border-line bg-surface2 p-0.5 text-sm">
            {(["todas", "mias"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFiltro(f)}
                className={`rounded-md px-3 py-1 font-medium transition ${
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
        <div className="mt-6 min-h-0 flex-1 overflow-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead>
              <tr className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:border-b [&_th]:border-line [&_th]:bg-surface2 [&_th]:px-3 [&_th]:py-2.5 [&_th]:text-left [&_th]:text-xs [&_th]:font-semibold [&_th]:text-ink-2">
                <th>
                  <span className="inline-flex items-center gap-1.5">
                    <Hash size={13} className="text-ink-3" /> Código
                  </span>
                </th>
                <th>
                  <span className="inline-flex items-center gap-1.5">
                    <Target size={13} className="text-ink-3" /> Oportunidad
                  </span>
                </th>
                <th>
                  <span className="inline-flex items-center gap-1.5">
                    <Building2 size={13} className="text-ink-3" /> Cliente
                  </span>
                </th>
                <th>
                  <span className="inline-flex items-center gap-1.5">
                    <DollarSign size={13} className="text-ink-3" /> Total
                  </span>
                </th>
                <th>Estado</th>
                <th>
                  <span className="inline-flex items-center gap-1.5">
                    <User size={13} className="text-ink-3" /> Creado por
                  </span>
                </th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visibles.map((p) => (
                <tr
                  key={p.id}
                  className="border-t border-line transition-colors hover:bg-surface2"
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`/presupuestos/${p.id}`}
                      className="font-mono font-medium tabular-nums text-accent hover:underline"
                    >
                      {p.codigo}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <Link href={`/oportunidades?op=${p.oportunidad_id}`} className="inline-flex max-w-full">
                      <RefChip icon={<Target size={12} className="shrink-0 text-ink-3" />}>
                        {p.oportunidad?.asunto ?? `Oportunidad ${p.oportunidad_id}`}
                      </RefChip>
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    {p.oportunidad?.cliente?.razon_social ? (
                      <RefChip icon={<Building2 size={12} className="shrink-0 text-ink-3" />}>
                        {p.oportunidad.cliente.razon_social}
                      </RefChip>
                    ) : (
                      <span className="text-ink-3">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono tabular-nums text-ink">
                    {fmtMonto(p.monto_total, p.moneda)}
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone={TONO_PRESUPUESTO[p.estado]}>
                      {ESTADO_PRESUPUESTO[p.estado].label}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
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
              ))}
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
