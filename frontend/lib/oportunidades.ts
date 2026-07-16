// API + hooks de React Query para oportunidades, y metadatos de estados.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  EstadoOportunidad,
  Oportunidad,
  OportunidadCreate,
  OportunidadFiltros,
  OportunidadUpdate,
} from "@/lib/types";

const BASE = "/api/v1/oportunidades";

export const oportunidadKeys = {
  all: ["oportunidades"] as const,
};

// Etiqueta legible + color por estado (Tailwind). Orden = flujo del ciclo comercial.
export const ESTADOS: { value: EstadoOportunidad; label: string; color: string }[] = [
  { value: "nueva", label: "Nueva", color: "bg-blue-100 text-blue-700" },
  { value: "requiere_aclaracion", label: "Requiere aclaración", color: "bg-amber-100 text-amber-700" },
  { value: "en_compras", label: "En Compras", color: "bg-purple-100 text-purple-700" },
  { value: "presupuestada", label: "Presupuestada", color: "bg-cyan-100 text-cyan-700" },
  { value: "ganada", label: "Ganada", color: "bg-green-100 text-green-700" },
  { value: "cargada_en_gbp", label: "Cargada en GBP", color: "bg-teal-100 text-teal-700" },
  { value: "facturada", label: "Facturada", color: "bg-emerald-100 text-emerald-700" },
  { value: "perdida", label: "Perdida", color: "bg-red-100 text-red-700" },
  { value: "cerrada", label: "Cerrada", color: "bg-slate-200 text-slate-700" },
];

export const ESTADO_META: Record<EstadoOportunidad, { label: string; color: string }> =
  Object.fromEntries(ESTADOS.map((e) => [e.value, { label: e.label, color: e.color }])) as Record<
    EstadoOportunidad,
    { label: string; color: string }
  >;

export function useOportunidades(filtros?: OportunidadFiltros) {
  // Solo mandamos params con valor (los vacíos se omiten).
  const params: Record<string, string | number | boolean> = {};
  if (filtros?.estado) params.estado = filtros.estado;
  if (filtros?.cliente_id) params.cliente_id = filtros.cliente_id;
  if (filtros?.desde) params.desde = filtros.desde;
  if (filtros?.hasta) params.hasta = filtros.hasta;
  if (filtros?.solo_mias) params.solo_mias = true;
  if (filtros?.usuario_id) params.usuario_id = filtros.usuario_id;

  return useQuery({
    queryKey: [...oportunidadKeys.all, params],
    queryFn: async () => (await api.get<Oportunidad[]>(BASE, { params })).data,
  });
}

// Suma un comentario a la bitácora de seguimiento de la oportunidad.
export function useAgregarComentario(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (texto: string) =>
      (await api.post<Oportunidad>(`${BASE}/${id}/comentarios`, { texto })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: oportunidadKeys.all }),
  });
}

// Requerimiento pre-armado (por la IA) para la solicitud a Compras de esa oportunidad.
export function useSugerenciaCompras(id: number | null) {
  return useQuery({
    queryKey: [...oportunidadKeys.all, id, "sugerencia-compras"],
    queryFn: async () =>
      (await api.get<{ requerimiento: string }>(`${BASE}/${id}/sugerencia-compras`)).data,
    enabled: id !== null && id > 0,
  });
}

export function useCreateOportunidad() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: OportunidadCreate) =>
      (await api.post<Oportunidad>(BASE, body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: oportunidadKeys.all }),
  });
}

export function useUpdateOportunidad(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: OportunidadUpdate) =>
      (await api.patch<Oportunidad>(`${BASE}/${id}`, body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: oportunidadKeys.all }),
  });
}

// Elimina la oportunidad y todo lo que cuelga (mails, solicitudes, presupuestos…).
export function useDeleteOportunidad() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`${BASE}/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: oportunidadKeys.all });
      // Se borran también los mails ligados: refrescar la bandeja.
      qc.invalidateQueries({ queryKey: ["mails"] });
    },
  });
}
