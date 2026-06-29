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
