// API + hooks de React Query para oportunidades, y metadatos de estados.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { Tone as BadgeTone } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { useActualizarPreferencias, useMiUsuario } from "@/lib/usuarios";
import type {
  AdjuntoCompras,
  EstadoOportunidad,
  Mail,
  Oportunidad,
  Propuesta,
  OportunidadCreate,
  OportunidadFiltros,
  OportunidadUpdate,
  Seccion,
} from "@/lib/types";

const BASE = "/api/v1/oportunidades";

export const oportunidadKeys = {
  all: ["oportunidades"] as const,
  detail: (id: number) => ["oportunidades", "detail", id] as const,
  pendientes: ["oportunidades", "transferencias-pendientes"] as const,
  propuestas: ["oportunidades", "propuestas"] as const,
};

// Propuestas pendientes de revisión (mails auto-ingestados). Compartidas.
// `ambito` limita a la sección activa (Corporativo / Gubernamental).
export function usePropuestas(ambito?: Seccion) {
  return useQuery({
    queryKey: [...oportunidadKeys.propuestas, ambito ?? "todas"],
    queryFn: async () =>
      (await api.get<Propuesta[]>(`${BASE}/propuestas`, { params: ambito ? { ambito } : {} }))
        .data,
    refetchInterval: 120_000,
  });
}

// Aceptar (entra al pipeline) o rechazar (se descarta) una propuesta.
export function useResolverPropuesta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, accion }: { id: number; accion: "aceptar" | "rechazar" }) => {
      await api.post(`${BASE}/${id}/propuesta/${accion}`);
    },
    // Remoción optimista: la card desaparece al instante (no esperamos el refetch).
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: oportunidadKeys.propuestas });
      const prev = qc.getQueryData<Propuesta[]>(oportunidadKeys.propuestas);
      qc.setQueryData<Propuesta[]>(oportunidadKeys.propuestas, (old) =>
        (old ?? []).filter((p) => p.id !== id)
      );
      return { prev };
    },
    onError: (_e, _vars, ctx) => {
      // Si falló, restauramos la lista tal cual estaba.
      if (ctx?.prev) qc.setQueryData(oportunidadKeys.propuestas, ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: oportunidadKeys.propuestas });
      qc.invalidateQueries({ queryKey: oportunidadKeys.all });
    },
  });
}

// Adjuntos ya cargados a la oportunidad (subidos + de mails) que se pueden
// incluir en el pedido a Compras.
export function useAdjuntosCompras(oportunidadId: number) {
  return useQuery({
    queryKey: [...oportunidadKeys.detail(oportunidadId), "adjuntos-compras"],
    queryFn: async () =>
      (await api.get<AdjuntoCompras[]>(`${BASE}/${oportunidadId}/adjuntos-compras`)).data,
    enabled: oportunidadId > 0,
  });
}

// Transferencias pendientes hacia el usuario logueado (para el indicador).
export function useTransferenciasPendientes() {
  return useQuery({
    queryKey: oportunidadKeys.pendientes,
    queryFn: async () =>
      (await api.get<Oportunidad[]>(`${BASE}/transferencias-pendientes`)).data,
    // Refresca solo para que el indicador aparezca sin recargar la página.
    refetchInterval: 90_000,
  });
}

// Transferir una oportunidad a otro vendedor (queda pendiente hasta que acepte).
export function useTransferirOportunidad() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, aUsuarioId }: { id: number; aUsuarioId: number }) =>
      (await api.post<Oportunidad>(`${BASE}/${id}/transferir`, { a_usuario_id: aUsuarioId })).data,
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: oportunidadKeys.all });
      qc.invalidateQueries({ queryKey: oportunidadKeys.pendientes });
      qc.invalidateQueries({ queryKey: oportunidadKeys.detail(id) });
    },
  });
}

// Aceptar / rechazar una transferencia recibida.
export function useResolverTransferencia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, accion }: { id: number; accion: "aceptar" | "rechazar" }) =>
      (await api.post<Oportunidad>(`${BASE}/${id}/transferir/${accion}`)).data,
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: oportunidadKeys.all });
      qc.invalidateQueries({ queryKey: oportunidadKeys.pendientes });
      qc.invalidateQueries({ queryKey: oportunidadKeys.detail(id) });
    },
  });
}

// Etiqueta legible + tono semántico por estado. Orden = flujo del ciclo comercial.
//
// El TONO codifica de quién es la pelota, no el paso del ciclo (para eso está la
// etiqueta): ámbar = te espera a vos · gris = esperás a Compras · azul = esperás
// al cliente · violeta = a cobrar. Los dos terminales conservan color de
// resultado (verde/rojo) porque ahí el resultado sí es la información.
//
// Se usan los tonos del `Badge` (tokens semánticos, mode-aware) y NO clases de
// paleta cruda: `bg-blue-100` y compañía no tienen variante dark y quedaban como
// bloques casi blancos sobre el fondo #101120 del tema oscuro.
export const ESTADOS: { value: EstadoOportunidad; label: string; tone: BadgeTone }[] = [
  { value: "nueva", label: "Nueva", tone: "warning" },
  { value: "requiere_aclaracion", label: "Requiere aclaración", tone: "warning" },
  { value: "en_compras", label: "Enviado a compras", tone: "neutral" },
  { value: "cotizado_compras", label: "Cotizado por compras", tone: "warning" },
  { value: "presupuestada", label: "Enviada al cliente", tone: "info" },
  { value: "confirmada", label: "Confirmada / Pendiente", tone: "accent" },
  { value: "pago_pendiente_entrega", label: "Pagó / Pendiente de Entrega", tone: "success" },
  { value: "entregado_pendiente_pago", label: "Entregado / Pendiente de Pago", tone: "success" },
  { value: "finalizado", label: "Finalizado", tone: "success" },
  { value: "perdida", label: "No avanzó", tone: "danger" },
];

// Resaltado de filas: es PERSONAL por usuario (se guarda la lista de ids de
// oportunidades resaltadas en `usuario.preferencias.resaltadas`). No es una marca
// compartida de la oportunidad.
export function useResaltadas() {
  const { data: me } = useMiUsuario();
  const actualizar = useActualizarPreferencias();
  const resaltadas =
    (me?.preferencias as { resaltadas?: number[] } | undefined)?.resaltadas ?? [];
  const set = new Set(resaltadas);
  return {
    esResaltada: (id: number) => set.has(id),
    toggle: (id: number) =>
      actualizar.mutate({
        resaltadas: set.has(id) ? resaltadas.filter((x) => x !== id) : [...resaltadas, id],
      }),
  };
}

export const ESTADO_META: Record<EstadoOportunidad, { label: string; tone: BadgeTone }> =
  Object.fromEntries(ESTADOS.map((e) => [e.value, { label: e.label, tone: e.tone }])) as Record<
    EstadoOportunidad,
    { label: string; tone: BadgeTone }
  >;

export function useOportunidades(filtros?: OportunidadFiltros) {
  // Solo mandamos params con valor (los vacíos se omiten).
  const params: Record<string, string | number | boolean> = {};
  if (filtros?.estado) params.estado = filtros.estado;
  if (filtros?.cliente_id) params.cliente_id = filtros.cliente_id;
  if (filtros?.ambito) params.ambito = filtros.ambito;
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

// Admin: pide seguimiento al vendedor de la oportunidad (mail + aviso in-app).
export function useSeguimientoMail(id: number) {
  return useMutation({
    mutationFn: async (body: { asunto?: string; cuerpo: string }) =>
      (await api.post<{ enviado: boolean; para: string }>(
        `${BASE}/${id}/seguimiento-mail`,
        body
      )).data,
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
// `origen` marca los adjuntos (ej. "requerimiento" para imágenes pegadas en el
// texto del requerimiento), para mostrarlos aparte de los del cliente.
export function useSubirAdjuntosOportunidad(id: number, origen?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (files: File[]) => {
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f));
      const url = origen
        ? `${BASE}/${id}/adjuntos?origen=${encodeURIComponent(origen)}`
        : `${BASE}/${id}/adjuntos`;
      return (await api.post<Oportunidad>(url, fd)).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: oportunidadKeys.detail(id) });
      qc.invalidateQueries({ queryKey: oportunidadKeys.all });
    },
  });
}

// Subida directa (sin hook) para usar tras crear una oportunidad, cuando el id
// recién existe. Sube al mismo endpoint que useSubirAdjuntosOportunidad.
export async function subirAdjuntosOportunidad(
  id: number,
  files: File[],
  origen?: string,
): Promise<void> {
  if (!files.length) return;
  const fd = new FormData();
  files.forEach((f) => fd.append("files", f));
  const url = origen
    ? `${BASE}/${id}/adjuntos?origen=${encodeURIComponent(origen)}`
    : `${BASE}/${id}/adjuntos`;
  await api.post(url, fd);
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

// Object URL de un adjunto (imagen) para mostrarlo como miniatura, respetando
// el auth (un <img src> no manda el token). El caller debe revocar la URL.
export async function objectUrlAdjuntoOportunidad(
  oportunidadId: number,
  adjuntoId: number,
): Promise<string> {
  const res = await api.get(`${BASE}/${oportunidadId}/adjuntos/${adjuntoId}`, {
    responseType: "blob",
  });
  return URL.createObjectURL(res.data as Blob);
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
