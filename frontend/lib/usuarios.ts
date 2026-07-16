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
