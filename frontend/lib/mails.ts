// API + hooks de React Query para la bandeja (mails entrantes).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { oportunidadKeys } from "@/lib/oportunidades";
import type { IngestEmailRequest, Mail } from "@/lib/types";

const BASE = "/api/v1/mails";

export const mailKeys = {
  all: ["mails"] as const,
};

export function useMails() {
  return useQuery({
    queryKey: mailKeys.all,
    queryFn: async () => (await api.get<Mail[]>(BASE)).data,
  });
}

export function useIngestEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: IngestEmailRequest) =>
      (await api.post<Mail>(`${BASE}/ingest`, body)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: mailKeys.all });
      // El procesamiento crea una oportunidad: refrescar tablero/listado.
      qc.invalidateQueries({ queryKey: oportunidadKeys.all });
    },
  });
}

// Envía el acuse de recibo al cliente para un mail entrante (requiere Gmail).
export function useSendAcuse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (mailId: number) =>
      (await api.post<Mail>(`${BASE}/${mailId}/acuse`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: mailKeys.all }),
  });
}

// Envía al cliente el borrador de aclaración redactado por la IA (1 clic).
export function useSendAclaracion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (mailId: number) =>
      (await api.post<Mail>(`${BASE}/${mailId}/aclaracion`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: mailKeys.all }),
  });
}

// Dispara un polling manual de la casilla comercial (requiere Gmail configurado).
export function useSyncGmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => (await api.post<{ procesados: number }>(`${BASE}/sync`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: mailKeys.all });
      qc.invalidateQueries({ queryKey: oportunidadKeys.all });
    },
  });
}
