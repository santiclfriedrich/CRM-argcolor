"use client";

import { FileText, Trash2 } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Presupuestos</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Cotizaciones armadas en el CRM. Para crear una nueva, entrá a una oportunidad y usá
        “Armar presupuesto”.
      </p>

      {isLoading && <p className="mt-4 text-slate-500 dark:text-slate-400">Cargando…</p>}
      {isError && <p className="mt-4 text-red-600">No se pudo cargar.</p>}

      {data && (
        <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
              <tr>
                <th className="px-4 py-2 font-medium">Código</th>
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
                  className="border-t border-slate-100 dark:border-slate-800"
                >
                  <td className="px-4 py-2">
                    <Link
                      href={`/presupuestos/${p.id}`}
                      className="font-medium text-brand hover:underline"
                    >
                      {p.codigo}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-slate-700 dark:text-slate-200">
                    {p.oportunidad?.cliente?.razon_social ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-slate-700 dark:text-slate-200">
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
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => eliminar(p)}
                        disabled={deleteMut.isPending}
                        aria-label="Eliminar"
                        className="text-slate-400 hover:text-red-600 dark:text-slate-500"
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400 dark:text-slate-500">
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
