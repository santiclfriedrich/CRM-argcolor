// API + hooks de React Query para el ABM de usuarios.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { Usuario, UsuarioCreate, UsuarioUpdate } from "@/lib/types";

const BASE = "/api/v1/usuarios";
const KEY = ["usuarios"] as const;

export function useUsuarios() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => (await api.get<Usuario[]>(BASE)).data,
  });
}

export function useUsuario(id: number) {
  return useQuery({
    queryKey: [...KEY, id],
    queryFn: async () => (await api.get<Usuario>(`${BASE}/${id}`)).data,
    enabled: id > 0,
  });
}

// El usuario logueado (para su propia config, ej. pausar su sync de mails).
export function useMiUsuario() {
  return useQuery({
    queryKey: [...KEY, "me"],
    queryFn: async () => (await api.get<Usuario>(`${BASE}/me`)).data,
  });
}

// El usuario logueado pausa/activa su propia sincronización de mails.
export function useUpdateMiSyncMail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sync_mail_activo: boolean) =>
      (await api.patch<Usuario>(`${BASE}/me/sync-mail`, { sync_mail_activo })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

// Merge de preferencias de UI del usuario logueado (ej. orden de entrada,
// sección activa, filas resaltadas).
//
// Optimista: actualiza la caché de `me` AL INSTANTE (mismo merge shallow que hace
// el backend) y persiste en segundo plano, sin re-consultar `GET /me`. Así toggles
// como "Resaltar" se ven inmediatos en vez de esperar 2 viajes al servidor. Si el
// PATCH falla, revierte. `me` es privado del usuario, no hay conflicto con otros.
const ME_KEY = [...KEY, "me"] as const;

export function useActualizarPreferencias() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Record<string, unknown>) =>
      (await api.patch<Usuario>(`${BASE}/me/preferencias`, patch)).data,
    onMutate: async (patch: Record<string, unknown>) => {
      await qc.cancelQueries({ queryKey: ME_KEY });
      const prev = qc.getQueryData<Usuario>(ME_KEY);
      if (prev) {
        qc.setQueryData<Usuario>(ME_KEY, {
          ...prev,
          preferencias: { ...(prev.preferencias ?? {}), ...patch },
        });
      }
      return { prev };
    },
    onError: (_err, _patch, ctx) => {
      if (ctx?.prev) qc.setQueryData(ME_KEY, ctx.prev);
    },
  });
}

export function useCreateUsuario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: UsuarioCreate) => (await api.post<Usuario>(BASE, body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateUsuario(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: UsuarioUpdate) =>
      (await api.patch<Usuario>(`${BASE}/${id}`, body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteUsuario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`${BASE}/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
