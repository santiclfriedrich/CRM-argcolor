// API + hooks de React Query para la bandeja (mails entrantes).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { oportunidadKeys } from "@/lib/oportunidades";
import type {
  IngestEmailRequest,
  IngestResult,
  Mail,
  MailDescartado,
} from "@/lib/types";

const BASE = "/api/v1/mails";

export const mailKeys = {
  all: ["mails"] as const,
  descartados: ["mails", "descartados"] as const,
};

export function useMails() {
  return useQuery({
    queryKey: mailKeys.all,
    queryFn: async () => (await api.get<Mail[]>(BASE)).data,
  });
}

// Mails que la IA descartó por no ser consultas comerciales (solo para revisar).
export function useDescartados(enabled: boolean) {
  return useQuery({
    queryKey: mailKeys.descartados,
    queryFn: async () => (await api.get<MailDescartado[]>(`${BASE}/descartados`)).data,
    enabled,
  });
}

export function useIngestEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: IngestEmailRequest) =>
      (await api.post<IngestResult>(`${BASE}/ingest`, body)).data,
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

// Saca un mail de descartados para que la próxima sincronización lo reprocese.
export function useReprocesarDescartado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (descartadoId: number) => {
      await api.delete(`${BASE}/descartados/${descartadoId}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: mailKeys.descartados }),
  });
}

// Dispara un polling manual de la casilla comercial (requiere Gmail configurado).
export type SyncResult = {
  procesados: number;
  errores: number;
  ultimo_error: string | null;
};

export function useSyncGmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => (await api.post<SyncResult>(`${BASE}/sync`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: mailKeys.all });
      qc.invalidateQueries({ queryKey: oportunidadKeys.all });
    },
  });
}
