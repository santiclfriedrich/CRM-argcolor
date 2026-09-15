// API + hooks de React Query para la bandeja (mails entrantes).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { oportunidadKeys } from "@/lib/oportunidades";
import type {
  CarpetaInbox,
  IngestEmailRequest,
  IngestResult,
  InboxMail,
  Mail,
  MailDescartado,
  Seccion,
} from "@/lib/types";

const BASE = "/api/v1/mails";

// Descarga un adjunto de un mail (PDF, planilla, etc.) con el JWT que mete axios.
export async function descargarAdjuntoMail(
  adjuntoId: number,
  filename: string,
): Promise<void> {
  const res = await api.get(`${BASE}/adjuntos/${adjuntoId}`, { responseType: "blob" });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const mailKeys = {
  all: ["mails"] as const,
  descartados: ["mails", "descartados"] as const,
  hilo: (mailId: number) => ["mails", "hilo", mailId] as const,
  inbox: (carpeta: CarpetaInbox) => ["mails", "inbox", carpeta] as const,
};

// --- Inbox del CRM (bandeja tipo Gmail): por carpeta de la casilla del usuario ---
export function useInbox(carpeta: CarpetaInbox) {
  return useQuery({
    queryKey: mailKeys.inbox(carpeta),
    queryFn: async () =>
      (await api.get<InboxMail[]>(`${BASE}/inbox`, { params: { carpeta } })).data,
  });
}

export function useMarcarLeido() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, leido }: { id: number; leido: boolean }) =>
      (await api.post<InboxMail>(`${BASE}/${id}/leido`, { leido })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mails", "inbox"] }),
  });
}

export function useEliminarMail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`${BASE}/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mails", "inbox"] }),
  });
}

export function useRedactar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { para: string; asunto?: string; cuerpo: string }) =>
      (await api.post<Mail>(`${BASE}/redactar`, body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mails", "inbox"] }),
  });
}

// `ambito` limita la bandeja a la sección activa (Corporativo / Gubernamental).
export function useMails(oportunidadId?: number, ambito?: Seccion) {
  return useQuery({
    queryKey: [...mailKeys.all, { oportunidadId, ambito }],
    queryFn: async () => {
      const params: Record<string, string | number> = {};
      if (oportunidadId) params.oportunidad_id = oportunidadId;
      if (ambito) params.ambito = ambito;
      return (await api.get<Mail[]>(BASE, { params })).data;
    },
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

// Envía al cliente la aclaración. `cuerpo` opcional = borrador editado a mano;
// si no viene, el backend usa el que redactó la IA.
export function useSendAclaracion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ mailId, cuerpo }: { mailId: number; cuerpo?: string }) =>
      (await api.post<Mail>(`${BASE}/${mailId}/aclaracion`, { cuerpo })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: mailKeys.all }),
  });
}

// Trae toda la conversación (entrantes + salientes) del hilo de un mail.
export function useHilo(mailId: number, enabled: boolean) {
  return useQuery({
    queryKey: mailKeys.hilo(mailId),
    queryFn: async () => (await api.get<Mail[]>(`${BASE}/${mailId}/hilo`)).data,
    enabled,
  });
}

// Responde al cliente con texto libre, dentro del mismo hilo, desde tu casilla.
export function useResponder(mailId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (cuerpo: string) =>
      (await api.post<Mail>(`${BASE}/${mailId}/responder`, { cuerpo })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: mailKeys.hilo(mailId) });
      qc.invalidateQueries({ queryKey: mailKeys.all });
    },
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
  actualizados?: number;
  errores: number;
  ultimo_error: string | null;
};

export function useSyncGmail() {
  const qc = useQueryClient();
  return useMutation({
    // timeout holgado: el sync de inbox es rápido (batch), pero no lo dejamos
    // colgado para siempre si la red o Gmail no responden.
    mutationFn: async () =>
      (await api.post<SyncResult>(`${BASE}/sync`, undefined, { timeout: 60000 })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: mailKeys.all });
      qc.invalidateQueries({ queryKey: oportunidadKeys.all });
    },
  });
}
