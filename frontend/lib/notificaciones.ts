// API + hooks de React Query para las notificaciones in-app (campana).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { Notificacion } from "@/lib/types";

const BASE = "/api/v1/notificaciones";

export const notificacionKeys = {
  all: ["notificaciones"] as const,
};

// Trae las notificaciones del usuario; re-consulta cada 30s para que la campana
// se actualice sola cuando el poller resuelve una aclaración.
export function useNotificaciones() {
  return useQuery({
    queryKey: notificacionKeys.all,
    queryFn: async () => (await api.get<Notificacion[]>(BASE)).data,
    refetchInterval: 30_000,
  });
}

export function useMarcarLeida() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.post(`${BASE}/${id}/leida`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: notificacionKeys.all }),
  });
}

export function useMarcarTodasLeidas() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await api.post(`${BASE}/leer-todas`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: notificacionKeys.all }),
  });
}
