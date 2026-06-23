// API + hooks de React Query para clientes, contactos y dominios.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  Cliente,
  ClienteCreate,
  ClienteDetail,
  ClienteUpdate,
  Contacto,
  ContactoCreate,
  ContactoUpdate,
  Dominio,
  DominioCreate,
  DominioUpdate,
} from "@/lib/types";

const BASE = "/api/v1/clientes";

export const clienteKeys = {
  all: ["clientes"] as const,
  detail: (id: number) => ["clientes", id] as const,
};

// ---------- Clientes ----------

export function useClientes() {
  return useQuery({
    queryKey: clienteKeys.all,
    queryFn: async () => (await api.get<Cliente[]>(BASE)).data,
  });
}

export function useCliente(id: number) {
  return useQuery({
    queryKey: clienteKeys.detail(id),
    queryFn: async () => (await api.get<ClienteDetail>(`${BASE}/${id}`)).data,
    enabled: Number.isFinite(id) && id > 0,
  });
}

export function useCreateCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: ClienteCreate) => (await api.post<Cliente>(BASE, body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: clienteKeys.all }),
  });
}

export function useUpdateCliente(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: ClienteUpdate) =>
      (await api.patch<Cliente>(`${BASE}/${id}`, body)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: clienteKeys.all });
      qc.invalidateQueries({ queryKey: clienteKeys.detail(id) });
    },
  });
}

// ---------- Contactos (anidados) ----------

export function useCreateContacto(clienteId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: ContactoCreate) =>
      (await api.post<Contacto>(`${BASE}/${clienteId}/contactos`, body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: clienteKeys.detail(clienteId) }),
  });
}

export function useUpdateContacto(clienteId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: number; body: ContactoUpdate }) =>
      (await api.patch<Contacto>(`${BASE}/${clienteId}/contactos/${id}`, body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: clienteKeys.detail(clienteId) }),
  });
}

export function useDeleteContacto(clienteId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`${BASE}/${clienteId}/contactos/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: clienteKeys.detail(clienteId) }),
  });
}

// ---------- Dominios (anidados) ----------

export function useCreateDominio(clienteId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: DominioCreate) =>
      (await api.post<Dominio>(`${BASE}/${clienteId}/dominios`, body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: clienteKeys.detail(clienteId) }),
  });
}

export function useUpdateDominio(clienteId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: number; body: DominioUpdate }) =>
      (await api.patch<Dominio>(`${BASE}/${clienteId}/dominios/${id}`, body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: clienteKeys.detail(clienteId) }),
  });
}

export function useDeleteDominio(clienteId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`${BASE}/${clienteId}/dominios/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: clienteKeys.detail(clienteId) }),
  });
}
