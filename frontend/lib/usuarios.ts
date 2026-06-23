// Hook de React Query para listar usuarios (selector de vendedor).
import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { Usuario } from "@/lib/types";

export function useUsuarios() {
  return useQuery({
    queryKey: ["usuarios"],
    queryFn: async () => (await api.get<Usuario[]>("/api/v1/usuarios")).data,
  });
}
