"use client";

import { Building2, FileText, Target } from "lucide-react";
import { useRouter } from "next/navigation";

import { type TipoRegistro, useRegistrosRecientes } from "@/lib/recientes";

const ICONO: Record<TipoRegistro, { icon: typeof Target; bg: string }> = {
  Cuenta: { icon: Building2, bg: "bg-blue-500" },
  Oportunidad: { icon: Target, bg: "bg-orange-500" },
  Presupuesto: { icon: FileText, bg: "bg-violet-500" },
};

export default function RecientesPage() {
  const { data, isLoading } = useRegistrosRecientes(30);
  const router = useRouter();

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Registros recientes</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        {isLoading ? "Cargando…" : `${data.length} elemento${data.length === 1 ? "" : "s"}`}
      </p>

      <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Tipo</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r) => {
              const { icon: Icon, bg } = ICONO[r.tipo];
              return (
                <tr
                  key={r.key}
                  onClick={() => router.push(r.href)}
                  className="cursor-pointer border-t border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                >
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-3">
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white ${bg}`}>
                        <Icon size={16} />
                      </span>
                      <span className="font-medium text-brand">{r.nombre}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{r.tipo}</td>
                </tr>
              );
            })}
            {!isLoading && data.length === 0 && (
              <tr>
                <td colSpan={2} className="px-4 py-8 text-center text-slate-400 dark:text-slate-500">
                  Todavía no hay registros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
