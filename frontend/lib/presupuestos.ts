// API + hooks de React Query para presupuestos (armador de cotizaciones).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { Tone } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { oportunidadKeys } from "@/lib/oportunidades";
import type {
  EstadoCargaGbp,
  EstadoPresupuesto,
  Presupuesto,
  PresupuestoCreate,
  PresupuestoUpdate,
  Seccion,
} from "@/lib/types";

const BASE = "/api/v1/presupuestos";

// Opciones de "Entregar por" que ofrece GBP (elegibles en el CRM).
export const ENTREGA_OPCIONES = ["Retiro TML - Garin", "TML Corpo"] as const;

export const ESTADO_CARGA_GBP: Record<
  EstadoCargaGbp,
  { label: string; tono: Tone }
> = {
  pendiente: { label: "En cola GBP", tono: "warning" },
  en_proceso: { label: "Cargando en GBP", tono: "info" },
  cargado: { label: "Cargado en GBP", tono: "success" },
  error: { label: "Error en GBP", tono: "danger" },
  prueba: { label: "Prueba OK (no guardado)", tono: "info" },
  revisar: { label: "Requiere verificación", tono: "warning" },
};

export const ESTADO_PRESUPUESTO: Record<EstadoPresupuesto, { label: string; color: string }> = {
  borrador: { label: "Borrador", color: "bg-slate-200 text-slate-700" },
  enviado: { label: "Enviado", color: "bg-blue-100 text-blue-700" },
  aceptado: { label: "Aceptado", color: "bg-green-100 text-green-700" },
  rechazado: { label: "Rechazado", color: "bg-red-100 text-red-700" },
  negociando: { label: "Negociando", color: "bg-amber-100 text-amber-700" },
};

export function fmtMonto(monto: number | null, moneda: string): string {
  if (monto == null) return "—";
  return `${moneda} ${monto.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export const presupuestoKeys = {
  all: ["presupuestos"] as const,
  detail: (id: number) => ["presupuestos", id] as const,
};

export interface SucursalOpcion {
  valor: string;
  nombre: string;
}

// Fallback para que el desplegable NUNCA quede vacío (mientras carga el fetch o si
// falla). El backend sigue siendo la fuente para agregar sucursales nuevas.
const SUCURSALES_FALLBACK: SucursalOpcion[] = [
  { valor: "1", nombre: "ARG COLOR" },
  { valor: "30", nombre: "SKOP TRADER" },
];

// Opciones de sucursal de GBP. Las trae del backend (fuente única) y, hasta que
// respondan, usa el fallback. Devuelve SIEMPRE una lista no vacía.
export function useSucursales(): SucursalOpcion[] {
  const { data } = useQuery({
    queryKey: ["presupuestos", "sucursales"],
    queryFn: async () => (await api.get<SucursalOpcion[]>(`${BASE}/sucursales`)).data,
    staleTime: 60 * 60 * 1000,
  });
  return data?.length ? data : SUCURSALES_FALLBACK;
}

// Nombre visible de una sucursal a partir de su valor (fallback: el valor).
export function nombreSucursal(opciones: SucursalOpcion[] | undefined, valor: string | null) {
  return opciones?.find((o) => o.valor === valor)?.nombre ?? valor ?? "—";
}

export function usePresupuestos(
  oportunidadId?: number,
  usuarioId?: number,
  ambito?: Seccion
) {
  return useQuery({
    queryKey: [...presupuestoKeys.all, { oportunidadId, usuarioId, ambito }],
    queryFn: async () => {
      const params: Record<string, string | number> = {};
      if (oportunidadId) params.oportunidad_id = oportunidadId;
      if (usuarioId) params.usuario_id = usuarioId;
      if (ambito) params.ambito = ambito;
      return (await api.get<Presupuesto[]>(BASE, { params })).data;
    },
  });
}

export function usePresupuesto(id: number, enabled = true) {
  return useQuery({
    queryKey: presupuestoKeys.detail(id),
    queryFn: async () => (await api.get<Presupuesto>(`${BASE}/${id}`)).data,
    enabled,
  });
}

export function useCreatePresupuesto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: PresupuestoCreate) =>
      (await api.post<Presupuesto>(BASE, body)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: presupuestoKeys.all });
      // Crear un presupuesto avanza la oportunidad a "presupuestada".
      qc.invalidateQueries({ queryKey: oportunidadKeys.all });
    },
  });
}

// Crea el presupuesto; si tiene muchos ítems, el backend lo parte en "partes"
// (cada una ≤ máx = un pedido de GBP). Devuelve la lista (1 o N).
export function useCrearLote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: PresupuestoCreate) =>
      (await api.post<Presupuesto[]>(`${BASE}/lote`, body)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: presupuestoKeys.all });
      qc.invalidateQueries({ queryKey: oportunidadKeys.all });
    },
  });
}

// Reencola UNA parte (desde el listado). confirmar=true para partes en "revisar".
export function useReencolarParte() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, confirmar }: { id: number; confirmar?: boolean }) =>
      (
        await api.post<Presupuesto>(`${BASE}/${id}/cargar-gbp`, null, {
          params: confirmar ? { confirmar: true } : undefined,
        })
      ).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: presupuestoKeys.all }),
  });
}

// Encola TODAS las partes de un lote para que el bot las cargue en GBP.
export function useCargarGrupoEnGbp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (grupo: string) =>
      (await api.post<Presupuesto[]>(`${BASE}/grupo/${grupo}/cargar-gbp`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: presupuestoKeys.all }),
  });
}

// Crea un presupuesto pre-llenado con la respuesta de Compras ya parseada.
export function useCrearDesdeSolicitud() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (solicitudId: number) =>
      (await api.post<Presupuesto>(`${BASE}/desde-solicitud/${solicitudId}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: presupuestoKeys.all });
      qc.invalidateQueries({ queryKey: oportunidadKeys.all });
    },
  });
}

export function useUpdatePresupuesto(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: PresupuestoUpdate) =>
      (await api.patch<Presupuesto>(`${BASE}/${id}`, body)).data,
    onSuccess: (data) => {
      qc.setQueryData(presupuestoKeys.detail(id), data);
      qc.invalidateQueries({ queryKey: presupuestoKeys.all });
    },
  });
}

// Envía el presupuesto (PDF) al cliente por Gmail y lo marca como enviado.
export function useEnviarPresupuesto(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { to?: string; mensaje?: string }) =>
      (await api.post<Presupuesto>(`${BASE}/${id}/enviar`, body)).data,
    onSuccess: (data) => {
      qc.setQueryData(presupuestoKeys.detail(id), data);
      qc.invalidateQueries({ queryKey: presupuestoKeys.all });
      qc.invalidateQueries({ queryKey: oportunidadKeys.all });
    },
  });
}

// Encola el presupuesto para que el bot lo cargue en GBP (acción explícita).
export function useCargarEnGbp(id: number) {
  const qc = useQueryClient();
  return useMutation({
    // confirmar=true reencola una parte en estado "revisar" (pudo quedar guardada).
    mutationFn: async (confirmar?: boolean) =>
      (
        await api.post<Presupuesto>(`${BASE}/${id}/cargar-gbp`, null, {
          params: confirmar ? { confirmar: true } : undefined,
        })
      ).data,
    onSuccess: (data) => {
      qc.setQueryData(presupuestoKeys.detail(id), data);
      qc.invalidateQueries({ queryKey: presupuestoKeys.all });
    },
  });
}

export function useDeletePresupuesto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`${BASE}/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: presupuestoKeys.all }),
  });
}

// Error de validación del Excel: una fila con su número y el mensaje.
export interface ErrorFilaExcel {
  fila: number;
  mensaje: string;
}

// Sube el Excel + datos de cabecera: el backend valida TODO y, si no hay errores,
// crea el lote (partes de 20). Si hay errores, lanza (los errores vienen en
// error.response.data.detail.errores). No crea nada si hay errores.
export async function importarLote(
  file: File,
  header: {
    cliente_numero: string;
    entrega_por: string;
    documento: string;
    sucursal: string;
    cliente_id?: number | null;
    oportunidad_id?: number | null;
  }
): Promise<Presupuesto[]> {
  const fd = new FormData();
  fd.append("archivo", file);
  fd.append("cliente_numero", header.cliente_numero);
  fd.append("entrega_por", header.entrega_por);
  fd.append("documento", header.documento);
  fd.append("sucursal", header.sucursal);
  if (header.cliente_id != null) fd.append("cliente_id", String(header.cliente_id));
  if (header.oportunidad_id != null) fd.append("oportunidad_id", String(header.oportunidad_id));
  return (await api.post<Presupuesto[]>(`${BASE}/importar-lote`, fd)).data;
}

// Descarga el PDF (autenticado con el JWT) y lo abre en una pestaña nueva.
export async function abrirPdf(id: number): Promise<void> {
  const res = await api.get(`${BASE}/${id}/pdf`, { responseType: "blob" });
  const url = URL.createObjectURL(res.data as Blob);
  window.open(url, "_blank", "noopener");
  // Liberamos el objeto un rato después (dio tiempo a que el visor lo cargue).
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
