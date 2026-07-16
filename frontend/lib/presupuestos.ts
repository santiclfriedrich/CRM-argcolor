// API + hooks de React Query para presupuestos (armador de cotizaciones).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { oportunidadKeys } from "@/lib/oportunidades";
import type {
  EstadoPresupuesto,
  Presupuesto,
  PresupuestoCreate,
  PresupuestoUpdate,
} from "@/lib/types";

const BASE = "/api/v1/presupuestos";

export const ESTADO_PRESUPUESTO: Record<EstadoPresupuesto, { label: string; color: string }> = {
  borrador: { label: "Borrador", color: "bg-slate-200 text-slate-700" },
  enviado: { label: "Enviado", color: "bg-blue-100 text-blue-700" },
  aceptado: { label: "Aceptado", color: "bg-green-100 text-green-700" },
  rechazado: { label: "Rechazado", color: "bg-red-100 text-red-700" },
  negociando: { label: "Negociando", color: "bg-amber-100 text-amber-700" },
};

export function fmtMonto(monto: number | null, moneda: string): string {
  if (monto == null) return "—";
  return `${moneda} ${monto.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export const presupuestoKeys = {
  all: ["presupuestos"] as const,
  detail: (id: number) => ["presupuestos", id] as const,
};

export function usePresupuestos(oportunidadId?: number, usuarioId?: number) {
  return useQuery({
    queryKey: [...presupuestoKeys.all, { oportunidadId, usuarioId }],
    queryFn: async () => {
      const params: Record<string, number> = {};
      if (oportunidadId) params.oportunidad_id = oportunidadId;
      if (usuarioId) params.usuario_id = usuarioId;
      return (await api.get<Presupuesto[]>(BASE, { params })).data;
    },
  });
}

export function usePresupuesto(id: number, enabled = true) {
  return useQuery({
    queryKey: presupuestoKeys.detail(id),
    queryFn: async () => (await api.get<Presupuesto>(`${BASE}/${id}`)).data,
    enabled,
  });
}

export function useCreatePresupuesto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: PresupuestoCreate) =>
      (await api.post<Presupuesto>(BASE, body)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: presupuestoKeys.all });
      // Crear un presupuesto avanza la oportunidad a "presupuestada".
      qc.invalidateQueries({ queryKey: oportunidadKeys.all });
    },
  });
}

// Crea un presupuesto pre-llenado con la respuesta de Compras ya parseada.
export function useCrearDesdeSolicitud() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (solicitudId: number) =>
      (await api.post<Presupuesto>(`${BASE}/desde-solicitud/${solicitudId}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: presupuestoKeys.all });
      qc.invalidateQueries({ queryKey: oportunidadKeys.all });
    },
  });
}

export function useUpdatePresupuesto(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: PresupuestoUpdate) =>
      (await api.patch<Presupuesto>(`${BASE}/${id}`, body)).data,
    onSuccess: (data) => {
      qc.setQueryData(presupuestoKeys.detail(id), data);
      qc.invalidateQueries({ queryKey: presupuestoKeys.all });
    },
  });
}

// Envía el presupuesto (PDF) al cliente por Gmail y lo marca como enviado.
export function useEnviarPresupuesto(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { to?: string; mensaje?: string }) =>
      (await api.post<Presupuesto>(`${BASE}/${id}/enviar`, body)).data,
    onSuccess: (data) => {
      qc.setQueryData(presupuestoKeys.detail(id), data);
      qc.invalidateQueries({ queryKey: presupuestoKeys.all });
      qc.invalidateQueries({ queryKey: oportunidadKeys.all });
    },
  });
}

export function useDeletePresupuesto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`${BASE}/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: presupuestoKeys.all }),
  });
}

// Descarga el PDF (autenticado con el JWT) y lo abre en una pestaña nueva.
export async function abrirPdf(id: number): Promise<void> {
  const res = await api.get(`${BASE}/${id}/pdf`, { responseType: "blob" });
  const url = URL.createObjectURL(res.data as Blob);
  window.open(url, "_blank", "noopener");
  // Liberamos el objeto un rato después (dio tiempo a que el visor lo cargue).
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
