// Bloc de notas personal (autoguardado).
import { useMutation, useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";

const BASE = "/api/v1/notas";

export interface Nota {
  contenido: string;
  updated_at: string | null;
}

export function useNota() {
  return useQuery({
    queryKey: ["nota"],
    queryFn: async () => (await api.get<Nota>(BASE)).data,
  });
}

export function useGuardarNota() {
  return useMutation({
    mutationFn: async (contenido: string) =>
      (await api.put<Nota>(BASE, { contenido })).data,
  });
}
