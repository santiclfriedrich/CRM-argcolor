"use client";

import { FileText, Trash2 } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import {
  abrirPdf,
  ESTADO_PRESUPUESTO,
  fmtMonto,
  useDeletePresupuesto,
  usePresupuestos,
} from "@/lib/presupuestos";
import type { Presupuesto } from "@/lib/types";

export default function PresupuestosPage() {
  const { data, isLoading, isError } = usePresupuestos();
  const deleteMut = useDeletePresupuesto();

  const eliminar = (p: Presupuesto) => {
    if (window.confirm(`¿Eliminar el presupuesto ${p.codigo}? No se puede deshacer.`)) {
      deleteMut.mutate(p.id);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink">Presupuestos</h1>
      <p className="mt-1 text-sm text-ink-2">
        Cotizaciones armadas en el CRM. Para crear una nueva, entrá a una oportunidad y usá
        “Armar presupuesto”.
      </p>

      {isLoading && <p className="mt-4 text-ink-2">Cargando…</p>}
      {isError && <p className="mt-4 text-red-600">No se pudo cargar.</p>}

      {data && (
        <div className="mt-6 overflow-hidden rounded-lg border border-line">
          <table className="w-full text-sm">
            <thead className="bg-surface2 text-left text-ink-2">
              <tr>
                <th className="px-4 py-2 font-medium">Código</th>
                <th className="px-4 py-2 font-medium">Oportunidad</th>
                <th className="px-4 py-2 font-medium">Cliente</th>
                <th className="px-4 py-2 font-medium">Total</th>
                <th className="px-4 py-2 font-medium">Estado</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr
                  key={p.id}
                  className="border-t border-line"
                >
                  <td className="px-4 py-2">
                    <Link
                      href={`/presupuestos/${p.id}`}
                      className="font-medium text-accent hover:underline"
                    >
                      {p.codigo}
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-col items-start gap-1">
                      <Link
                        href={`/oportunidades?op=${p.oportunidad_id}`}
                        className="inline-flex items-center rounded-md border border-accent/30 bg-accent-dim px-2 py-0.5 text-xs font-semibold text-accent hover:bg-accent/20"
                      >
                        #{p.oportunidad_id}
                      </Link>
                      {p.oportunidad?.asunto && (
                        <span className="max-w-[16rem] truncate text-xs text-ink-2">
                          {p.oportunidad.asunto}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-ink">
                    {p.oportunidad?.cliente?.razon_social ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-ink">
                    {fmtMonto(p.monto_total, p.moneda)}
                  </td>
                  <td className="px-4 py-2">
                    <Badge className={ESTADO_PRESUPUESTO[p.estado].color}>
                      {ESTADO_PRESUPUESTO[p.estado].label}
                    </Badge>
                  </td>
                  <td className="px-4 py-2">
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
                          className="text-ink-3 hover:text-red-600"
                        >
                          <Trash2 size={14} />
                        </Button>
                      </Tooltip>
                    </div>
                  </td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-ink-3">
                    Todavía no hay presupuestos.
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
