// API + hooks de React Query para oportunidades, y metadatos de estados.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  EstadoOportunidad,
  Mail,
  Oportunidad,
  OportunidadCreate,
  OportunidadFiltros,
  OportunidadUpdate,
} from "@/lib/types";

const BASE = "/api/v1/oportunidades";

export const oportunidadKeys = {
  all: ["oportunidades"] as const,
  detail: (id: number) => ["oportunidades", "detail", id] as const,
};

// Etiqueta legible + color por estado (Tailwind). Orden = flujo del ciclo comercial.
export const ESTADOS: { value: EstadoOportunidad; label: string; color: string }[] = [
  { value: "nueva", label: "Nueva", color: "bg-blue-100 text-blue-700" },
  { value: "requiere_aclaracion", label: "Requiere aclaración", color: "bg-amber-100 text-amber-700" },
  { value: "en_compras", label: "Enviado a compras", color: "bg-purple-100 text-purple-700" },
  { value: "cotizado_compras", label: "Cotizado por compras", color: "bg-cyan-100 text-cyan-700" },
  { value: "presupuestada", label: "Enviada al cliente", color: "bg-indigo-100 text-indigo-700" },
  { value: "confirmada", label: "Confirmada / Pendiente", color: "bg-yellow-100 text-yellow-700" },
  { value: "ganada", label: "Pago", color: "bg-green-100 text-green-700" },
  { value: "perdida", label: "No avanzó", color: "bg-red-100 text-red-700" },
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

// Borra un comentario de la bitácora por su índice en la lista.
export function useEliminarComentario(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (indice: number) => {
      await api.delete(`${BASE}/${id}/comentarios/${indice}`);
    },
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

export function useOportunidad(id: number) {
  return useQuery({
    queryKey: oportunidadKeys.detail(id),
    queryFn: async () => (await api.get<Oportunidad>(`${BASE}/${id}`)).data,
    enabled: id > 0,
  });
}

export function useUpdateOportunidad(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: OportunidadUpdate) =>
      (await api.patch<Oportunidad>(`${BASE}/${id}`, body)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: oportunidadKeys.all });
      qc.invalidateQueries({ queryKey: oportunidadKeys.detail(id) });
    },
  });
}

// --- Adjuntos de la oportunidad ---
export function useSubirAdjuntosOportunidad(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (files: File[]) => {
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f));
      return (await api.post<Oportunidad>(`${BASE}/${id}/adjuntos`, fd)).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: oportunidadKeys.detail(id) });
      qc.invalidateQueries({ queryKey: oportunidadKeys.all });
    },
  });
}

// Subida directa (sin hook) para usar tras crear una oportunidad, cuando el id
// recién existe. Sube al mismo endpoint que useSubirAdjuntosOportunidad.
export async function subirAdjuntosOportunidad(id: number, files: File[]): Promise<void> {
  if (!files.length) return;
  const fd = new FormData();
  files.forEach((f) => fd.append("files", f));
  await api.post(`${BASE}/${id}/adjuntos`, fd);
}

export function useEliminarAdjuntoOportunidad(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (adjuntoId: number) => {
      await api.delete(`${BASE}/${id}/adjuntos/${adjuntoId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: oportunidadKeys.detail(id) });
      qc.invalidateQueries({ queryKey: oportunidadKeys.all });
    },
  });
}

// Descarga un adjunto respetando el auth (fetch blob -> link temporal).
export async function descargarAdjuntoOportunidad(
  oportunidadId: number,
  adjuntoId: number,
  filename: string,
): Promise<void> {
  const res = await api.get(`${BASE}/${oportunidadId}/adjuntos/${adjuntoId}`, {
    responseType: "blob",
  });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Marca/desmarca "cargada en GBP" (toggle rápido desde la tabla). Actualización
// optimista: cambia solo esa fila en la cache al instante, sin refetch (evita el
// "pestañeo" de toda la columna de checkboxes).
export function useToggleCargadaGbp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, valor }: { id: number; valor: boolean }) =>
      (await api.patch<Oportunidad>(`${BASE}/${id}`, { cargada_en_gbp: valor })).data,
    onMutate: async ({ id, valor }: { id: number; valor: boolean }) => {
      await qc.cancelQueries({ queryKey: oportunidadKeys.all });
      qc.setQueriesData<Oportunidad[]>({ queryKey: oportunidadKeys.all }, (old) =>
        Array.isArray(old)
          ? old.map((o) => (o.id === id ? { ...o, cargada_en_gbp: valor } : o))
          : old
      );
    },
    // Si falla, revertimos volviendo a pedir la lista.
    onError: () => qc.invalidateQueries({ queryKey: oportunidadKeys.all }),
  });
}

// Asigna el "Ing." (iniciales) inline desde la tabla, con update optimista.
export function useSetIng() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ing }: { id: number; ing: string | null }) =>
      (await api.patch<Oportunidad>(`${BASE}/${id}`, { ing })).data,
    onMutate: async ({ id, ing }: { id: number; ing: string | null }) => {
      await qc.cancelQueries({ queryKey: oportunidadKeys.all });
      qc.setQueriesData<Oportunidad[]>({ queryKey: oportunidadKeys.all }, (old) =>
        Array.isArray(old) ? old.map((o) => (o.id === id ? { ...o, ing } : o)) : old
      );
    },
    onError: () => qc.invalidateQueries({ queryKey: oportunidadKeys.all }),
  });
}

// Elimina la oportunidad y todo lo que cuelga (mails, solicitudes, presupuestos…).
// Borrado OPTIMISTA: saca la fila (y el mail en la bandeja) de la cache al
// instante, sin esperar al backend; si falla, revierte. El refresco real va por
// detrás (onSettled). Así no se siente el delay del borrado en cascada.
const MAILS_KEY = ["mails"] as const;

export function useDeleteOportunidad() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`${BASE}/${id}`);
    },
    onMutate: async (id: number) => {
      await qc.cancelQueries({ queryKey: oportunidadKeys.all });
      await qc.cancelQueries({ queryKey: MAILS_KEY });
      const prevOps = qc.getQueriesData<Oportunidad[]>({ queryKey: oportunidadKeys.all });
      const prevMails = qc.getQueriesData<Mail[]>({ queryKey: MAILS_KEY });
      qc.setQueriesData<Oportunidad[]>({ queryKey: oportunidadKeys.all }, (old) =>
        Array.isArray(old) ? old.filter((o) => o.id !== id) : old
      );
      qc.setQueriesData<Mail[]>({ queryKey: MAILS_KEY }, (old) =>
        Array.isArray(old) ? old.filter((m) => m.oportunidad_id !== id) : old
      );
      return { prevOps, prevMails };
    },
    onError: (_err, _id, ctx) => {
      // Revertir a lo que había antes del borrado optimista.
      ctx?.prevOps?.forEach(([key, data]) => qc.setQueryData<Oportunidad[]>(key, data));
      ctx?.prevMails?.forEach(([key, data]) => qc.setQueryData<Mail[]>(key, data));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: oportunidadKeys.all });
      qc.invalidateQueries({ queryKey: MAILS_KEY });
    },
  });
}

// Borra VARIAS oportunidades de una (una sola request + transacción). Optimista:
// las saca de la cache al instante, como el borrado individual.
export function useBulkDeleteOportunidades() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: number[]) =>
      (await api.post<{ eliminadas: number }>(`${BASE}/eliminar-multiples`, { ids })).data,
    onMutate: async (ids: number[]) => {
      await qc.cancelQueries({ queryKey: oportunidadKeys.all });
      await qc.cancelQueries({ queryKey: MAILS_KEY });
      const prevOps = qc.getQueriesData<Oportunidad[]>({ queryKey: oportunidadKeys.all });
      const prevMails = qc.getQueriesData<Mail[]>({ queryKey: MAILS_KEY });
      const set = new Set(ids);
      qc.setQueriesData<Oportunidad[]>({ queryKey: oportunidadKeys.all }, (old) =>
        Array.isArray(old) ? old.filter((o) => !set.has(o.id)) : old
      );
      qc.setQueriesData<Mail[]>({ queryKey: MAILS_KEY }, (old) =>
        Array.isArray(old)
          ? old.filter((m) => m.oportunidad_id == null || !set.has(m.oportunidad_id))
          : old
      );
      return { prevOps, prevMails };
    },
    onError: (_err, _ids, ctx) => {
      ctx?.prevOps?.forEach(([key, data]) => qc.setQueryData<Oportunidad[]>(key, data));
      ctx?.prevMails?.forEach(([key, data]) => qc.setQueryData<Mail[]>(key, data));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: oportunidadKeys.all });
      qc.invalidateQueries({ queryKey: MAILS_KEY });
    },
  });
}
