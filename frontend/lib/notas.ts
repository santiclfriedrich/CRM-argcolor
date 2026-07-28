// Bloc de notas personal (varias notas, autoguardado).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

const BASE = "/api/v1/notas";
const KEY = ["notas"] as const;

export interface Nota {
  id: number;
  contenido: string;
  updated_at: string | null;
}

export function useNotas() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => (await api.get<Nota[]>(BASE)).data,
  });
}

export function useCrearNota() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => (await api.post<Nota>(BASE, { contenido: "" })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

// Autoguardado de una nota. Actualiza la cache sin refetch (evita reordenar
// la lista mientras escribís) — el orden se refresca al recargar/cambiar de nota.
export function useGuardarNota() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, contenido }: { id: number; contenido: string }) =>
      (await api.put<Nota>(`${BASE}/${id}`, { contenido })).data,
    onSuccess: (nota) => {
      qc.setQueryData<Nota[]>(KEY, (old) =>
        (old ?? []).map((n) => (n.id === nota.id ? nota : n)),
      );
    },
  });
}

export function useEliminarNota() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`${BASE}/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

// Título = primera línea con texto; "Nueva nota" si está vacía.
export function tituloNota(contenido: string): string {
  const linea = contenido.split("\n").find((l) => l.trim());
  return linea?.trim().slice(0, 80) || "Nueva nota";
}

// Vista previa = resto del texto (para el snippet de la lista).
export function previewNota(contenido: string): string {
  const lineas = contenido.split("\n");
  const idx = lineas.findIndex((l) => l.trim());
  const resto = idx >= 0 ? lineas.slice(idx + 1) : [];
  return resto.join(" ").trim().slice(0, 120);
}
