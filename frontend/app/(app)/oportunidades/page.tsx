"use client";

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";

type Oportunidad = {
  id: number;
  cliente_id: number | null;
  vendedor_id: number | null;
  estado: string;
  fecha_creacion: string;
  fecha_ultimo_movimiento: string;
  fuente: string | null;
};

const ESTADO_COLOR: Record<string, string> = {
  nueva: "bg-blue-100 text-blue-700",
  requiere_aclaracion: "bg-amber-100 text-amber-700",
  en_compras: "bg-purple-100 text-purple-700",
  presupuestada: "bg-cyan-100 text-cyan-700",
  ganada: "bg-green-100 text-green-700",
  perdida: "bg-red-100 text-red-700",
};

export default function OportunidadesPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["oportunidades"],
    queryFn: async () => {
      const res = await api.get<Oportunidad[]>("/api/v1/oportunidades");
      return res.data;
    },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Oportunidades</h1>

      {isLoading && <p className="mt-4 text-slate-500">Cargando…</p>}
      {isError && (
        <p className="mt-4 text-red-600">
          No se pudo conectar al backend. ¿Está corriendo en {process.env.NEXT_PUBLIC_API_URL}?
        </p>
      )}

      {data && (
        <table className="mt-6 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-2 pr-4">ID</th>
              <th className="py-2 pr-4">Estado</th>
              <th className="py-2 pr-4">Cliente</th>
              <th className="py-2 pr-4">Vendedor</th>
              <th className="py-2 pr-4">Último movimiento</th>
            </tr>
          </thead>
          <tbody>
            {data.map((o) => (
              <tr key={o.id} className="border-b border-slate-100">
                <td className="py-2 pr-4 font-mono">{o.id}</td>
                <td className="py-2 pr-4">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      ESTADO_COLOR[o.estado] ?? "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {o.estado}
                  </span>
                </td>
                <td className="py-2 pr-4">{o.cliente_id ?? "—"}</td>
                <td className="py-2 pr-4">{o.vendedor_id ?? "—"}</td>
                <td className="py-2 pr-4">
                  {new Date(o.fecha_ultimo_movimiento).toLocaleDateString("es-AR")}
                </td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-slate-400">
                  No hay oportunidades todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
