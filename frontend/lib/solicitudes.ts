// API + hooks de React Query para solicitudes a Compras.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { oportunidadKeys } from "@/lib/oportunidades";
import type {
  CondicionPago,
  EstadoSolicitud,
  RespuestaCompras,
  Seccion,
  Solicitud,
  SolicitudCreate,
  SolicitudDetail,
  SolicitudUpdate,
} from "@/lib/types";

const BASE = "/api/v1/solicitudes";

export const solicitudKeys = {
  all: ["solicitudes"] as const,
  detail: (id: number) => ["solicitudes", id] as const,
};

export const CONDICIONES_PAGO: CondicionPago[] = [
  "15",
  "30",
  "45",
  "60",
  "120",
  "Transferencia",
  "Cheque Anticipado a Entrega - 15 días",
  "Cheque Anticipado a Entrega - 30 días",
  "Cheque Anticipado a Entrega - 60 días",
];

export const ESTADO_SOLICITUD_META: Record<EstadoSolicitud, { label: string; color: string }> = {
  enviada: { label: "Enviada", color: "bg-amber-100 text-amber-700" },
  respondida: { label: "Respondida", color: "bg-green-100 text-green-700" },
  cerrada: { label: "Cerrada", color: "bg-slate-100 text-slate-600" },
};

export function useSolicitudes(
  usuarioId?: number,
  oportunidadId?: number,
  ambito?: Seccion
) {
  return useQuery({
    queryKey:
      usuarioId || oportunidadId || ambito
        ? [...solicitudKeys.all, { usuarioId, oportunidadId, ambito }]
        : solicitudKeys.all,
    queryFn: async () => {
      const params: Record<string, string | number> = {};
      if (usuarioId) params.usuario_id = usuarioId;
      if (oportunidadId) params.oportunidad_id = oportunidadId;
      if (ambito) params.ambito = ambito;
      return (await api.get<Solicitud[]>(BASE, { params })).data;
    },
  });
}

export function useSolicitud(id: number | null) {
  return useQuery({
    queryKey: solicitudKeys.detail(id ?? 0),
    queryFn: async () => (await api.get<SolicitudDetail>(`${BASE}/${id}`)).data,
    enabled: id !== null && id > 0,
  });
}

// Sube los archivos adjuntos (PDF/imágenes del cliente) a una solicitud.
async function subirAdjuntos(id: number, files: File[]): Promise<void> {
  if (!files || files.length === 0) return;
  const fd = new FormData();
  files.forEach((f) => fd.append("files", f));
  await api.post(`${BASE}/${id}/adjuntos`, fd);
}

type CrearSolicitud = { body: SolicitudCreate; files?: File[] };

export function useCreateSolicitud() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ body, files }: CrearSolicitud) => {
      const solicitud = (await api.post<Solicitud>(BASE, body)).data;
      await subirAdjuntos(solicitud.id, files ?? []);
      return solicitud;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: solicitudKeys.all });
      // El alta mueve la oportunidad a "en_compras": refrescar tablero/listado.
      qc.invalidateQueries({ queryKey: oportunidadKeys.all });
    },
  });
}

// Crea la solicitud y la envía a Compras por Gmail en un solo paso (usado desde
// "Pedir a Compras" en Oportunidades). Si el envío falla, la solicitud ya quedó
// creada y se puede reintentar el envío desde /solicitudes.
export function useCrearYEnviarSolicitud() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ body, files }: CrearSolicitud) => {
      const solicitud = (await api.post<Solicitud>(BASE, body)).data;
      await subirAdjuntos(solicitud.id, files ?? []);
      await api.post(`${BASE}/${solicitud.id}/enviar`);
      return solicitud;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: solicitudKeys.all });
      qc.invalidateQueries({ queryKey: oportunidadKeys.all });
    },
  });
}

export function useUpdateSolicitud(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: SolicitudUpdate) =>
      (await api.patch<Solicitud>(`${BASE}/${id}`, body)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: solicitudKeys.all });
      qc.invalidateQueries({ queryKey: solicitudKeys.detail(id) });
    },
  });
}

// Envía la solicitud a Compras por Gmail (desde la casilla del vendedor).
export function useEnviarSolicitud(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => (await api.post<Solicitud>(`${BASE}/${id}/enviar`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: solicitudKeys.detail(id) });
      qc.invalidateQueries({ queryKey: solicitudKeys.all });
    },
  });
}

// Pega el texto de la respuesta de Compras y la IA extrae los ítems.
export function useCargarRespuesta(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (contenido: string) =>
      (await api.post<RespuestaCompras>(`${BASE}/${id}/respuesta`, { contenido })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: solicitudKeys.detail(id) });
      qc.invalidateQueries({ queryKey: solicitudKeys.all });
    },
  });
}
