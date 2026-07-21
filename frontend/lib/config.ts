// Hooks de React Query para los flags de automatización (Configuración).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

export interface Automatizacion {
  acuse_automatico: boolean;
  aclaracion_automatica: boolean;
}

const KEY = ["configuracion", "automatizacion"] as const;
const URL = "/api/v1/configuracion/automatizacion";

export function useAutomatizacion() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => (await api.get<Automatizacion>(URL)).data,
  });
}

export function useUpdateAutomatizacion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Partial<Automatizacion>) =>
      (await api.put<Automatizacion>(URL, body)).data,
    onSuccess: (data) => qc.setQueryData(KEY, data),
  });
}

// --- Destinatarios del mail a Compras ---
export interface DestinatariosCompras {
  to: string | null;
  cc: string[];
}

const COMPRAS_KEY = ["configuracion", "compras"] as const;
const COMPRAS_URL = "/api/v1/configuracion/compras";

export function useDestinatariosCompras() {
  return useQuery({
    queryKey: COMPRAS_KEY,
    queryFn: async () => (await api.get<DestinatariosCompras>(COMPRAS_URL)).data,
  });
}

export function useUpdateDestinatariosCompras() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: DestinatariosCompras) =>
      (await api.put<DestinatariosCompras>(COMPRAS_URL, body)).data,
    onSuccess: (data) => qc.setQueryData(COMPRAS_KEY, data),
  });
}

// --- Grupos de destinatarios de Compras (por usuario) ---
export interface GrupoCompras {
  id: number;
  nombre: string;
  to: string;
  cc: string[];
  es_default: boolean;
}

export type GrupoComprasInput = {
  nombre: string;
  to: string;
  cc: string[];
  es_default: boolean;
};

const GRUPOS_KEY = ["configuracion", "compras", "grupos"] as const;
const GRUPOS_URL = "/api/v1/configuracion/compras/grupos";

export function useGruposCompras() {
  return useQuery({
    queryKey: GRUPOS_KEY,
    queryFn: async () => (await api.get<GrupoCompras[]>(GRUPOS_URL)).data,
  });
}

export function useCreateGrupoCompras() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: GrupoComprasInput) =>
      (await api.post<GrupoCompras>(GRUPOS_URL, body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: GRUPOS_KEY }),
  });
}

export function useUpdateGrupoCompras() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: number; body: Partial<GrupoComprasInput> }) =>
      (await api.put<GrupoCompras>(`${GRUPOS_URL}/${id}`, body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: GRUPOS_KEY }),
  });
}

export function useDeleteGrupoCompras() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`${GRUPOS_URL}/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: GRUPOS_KEY }),
  });
}
