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

export interface TraerClienteResult {
  status:
    | "creado"
    | "ya_existe"
    | "no_encontrado"
    | "tipo_no_sincronizable"
    | "sin_cuit"
    | "error";
  cust_id: number;
  razon_social?: string | null;
  cuit?: string | null;
  tipo?: string | null;
  ck_id?: string | null;
  detalle?: string | null;
}

// Trae del ERP un cliente puntual por su N° exacto (para el cliente viejo que el
// sync incremental no ve). Refresca el listado al terminar.
export function useTraerClientePorNumero() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (custId: number) =>
      (await api.post<TraerClienteResult>(`${BASE}/cliente/${custId}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clientes"] }),
  });
}
