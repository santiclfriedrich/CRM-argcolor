// Hook de búsqueda global (clientes, contactos, operaciones).
import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { SearchResults } from "@/lib/types";

const EMPTY: SearchResults = { clientes: [], contactos: [], oportunidades: [] };

export function useGlobalSearch(q: string) {
  const termino = q.trim();
  return useQuery({
    queryKey: ["search", termino],
    queryFn: async () => {
      if (termino.length < 2) return EMPTY;
      return (await api.get<SearchResults>("/api/v1/search", { params: { q: termino } })).data;
    },
    enabled: termino.length >= 2,
    placeholderData: (prev) => prev,
  });
}
