// Sync de clientes GBP -> CRM (botón manual; el scheduler la corre cada 8h).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

export interface GbpSyncStatus {
  corriendo: boolean;
  iniciado: string | null;
  progreso: string | null;
  ultimo_resultado: string | null;
  clientes_sincronizados_en_db?: number | string;
}

const BASE = "/api/v1/sync/gbp";

// Estado de la sync. Mientras corre, refresca solo cada 3s.
export function useGbpSyncStatus(enabled: boolean) {
  return useQuery({
    queryKey: ["gbp-sync-status"],
    queryFn: async () => (await api.get<GbpSyncStatus>(`${BASE}/status`)).data,
    enabled,
    refetchInterval: (query) => (query.state.data?.corriendo ? 3000 : false),
  });
}

export function useRunGbpSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => (await api.post<GbpSyncStatus>(`${BASE}/run`)).data,
    // Refresca el estado para que arranque el polling mientras corre.
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gbp-sync-status"] }),
  });
}
