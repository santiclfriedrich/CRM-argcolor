// API + hooks de React Query para las tareas (agenda / to-do del vendedor).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

export type PrioridadTarea = "alta" | "media" | "baja";

export interface Tarea {
  id: number;
  titulo: string;
  descripcion: string | null;
  subtipo: string | null;
  fecha_vencimiento: string | null;
  prioridad: PrioridadTarea;
  recordatorio: string | null;
  completada: boolean;
  fecha_completada: string | null;
  created_at: string;
  updated_at: string;
  oportunidad_id: number | null;
  cliente_id: number | null;
  cliente: { id: number; razon_social: string; numero_cliente: string | null } | null;
  oportunidad: { id: number; asunto: string | null } | null;
  usuario: { id: number; nombre: string } | null;
}

export type TareaCreate = {
  titulo: string;
  descripcion?: string | null;
  subtipo?: string | null;
  fecha_vencimiento?: string | null;
  prioridad?: PrioridadTarea;
  recordatorio?: string | null;
  completada?: boolean;
  oportunidad_id?: number | null;
  cliente_id?: number | null;
};

// Subtipos de tarea (estilo Salesforce: Llamada, Email, etc.).
export const SUBTIPO_OPCIONES: { value: string; label: string }[] = [
  { value: "llamada", label: "Llamada" },
  { value: "email", label: "Email" },
  { value: "reunion", label: "Reunión" },
  { value: "otro", label: "Otro" },
];

export type TareaUpdate = Partial<TareaCreate> & { completada?: boolean };

export const PRIORIDAD_META: Record<PrioridadTarea, { label: string; color: string }> = {
  alta: { label: "Alta", color: "bg-red-500" },
  media: { label: "Normal", color: "bg-amber-500" },
  baja: { label: "Baja", color: "bg-slate-400" },
};

// Opciones que ofrecemos en la UI: Normal (media) o Alta.
export const PRIORIDAD_OPCIONES: { value: PrioridadTarea; label: string }[] = [
  { value: "media", label: "Normal" },
  { value: "alta", label: "Alta" },
];

const BASE = "/api/v1/tareas";

export const tareaKeys = {
  all: ["tareas"] as const,
};

export function useTareas(completada?: boolean) {
  const params = completada === undefined ? undefined : { completada };
  return useQuery({
    queryKey: [...tareaKeys.all, { completada: completada ?? null }],
    queryFn: async () => (await api.get<Tarea[]>(BASE, { params })).data,
  });
}

export function useCreateTarea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: TareaCreate) => (await api.post<Tarea>(BASE, body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: tareaKeys.all }),
  });
}

export function useUpdateTarea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: number; body: TareaUpdate }) =>
      (await api.patch<Tarea>(`${BASE}/${id}`, body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: tareaKeys.all }),
  });
}

export function useDeleteTarea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`${BASE}/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: tareaKeys.all }),
  });
}

// Helpers de fecha para "vence hoy / vencida".
export function esHoy(fecha: string | null): boolean {
  return !!fecha && fecha === new Date().toISOString().slice(0, 10);
}
export function estaVencidaTarea(t: Tarea): boolean {
  return (
    !t.completada &&
    !!t.fecha_vencimiento &&
    t.fecha_vencimiento < new Date().toISOString().slice(0, 10)
  );
}
