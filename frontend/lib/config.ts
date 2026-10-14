// Hooks de React Query para los flags de automatización (Configuración).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

export interface Automatizacion {
  acuse_automatico: boolean;
  aclaracion_automatica: boolean;
}

const KEY = ["configuracion", "automatizacion"] as const;
const URL = "/api/v1/configuracion/automatizacion";

export function useAutomatizacion() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => (await api.get<Automatizacion>(URL)).data,
  });
}

export function useUpdateAutomatizacion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Partial<Automatizacion>) =>
      (await api.put<Automatizacion>(URL, body)).data,
    onSuccess: (data) => qc.setQueryData(KEY, data),
  });
}

// --- Perfil de empresa (datos fijos para formularios de licitación) ---
export interface PerfilEmpresa {
  razon_social: string;
  cuit: string;
  forma_juridica: string;
  fecha_contrato_social: string;
  domicilio: string;
  localidad: string;
  cp: string;
  provincia: string;
  telefono: string;
  email: string;
  condicion_iva: string;
  condicion_iibb: string;
  nro_iibb: string;
  jurisdicciones_iibb: string;
  condicion_ganancias: string;
  actividad_principal: string;
  actividad_secundaria: string;
  banco: string;
  sucursal: string;
  cuenta: string;
  cbu: string;
  contacto_nombre: string;
  contacto_area: string;
  contacto_email: string;
  concepto_retencion: string;
  observaciones: string;
}

const PERFIL_KEY = ["configuracion", "perfil-empresa"] as const;
const PERFIL_URL = "/api/v1/configuracion/perfil-empresa";

export function usePerfilEmpresa() {
  return useQuery({
    queryKey: PERFIL_KEY,
    queryFn: async () => (await api.get<PerfilEmpresa>(PERFIL_URL)).data,
  });
}

export function useGuardarPerfilEmpresa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: PerfilEmpresa) =>
      (await api.put<PerfilEmpresa>(PERFIL_URL, body)).data,
    onSuccess: (data) => qc.setQueryData(PERFIL_KEY, data),
  });
}

// --- Autocompletar formularios con IA ---
export interface CampoFormulario {
  etiqueta: string;
  valor: string;
  encontrado: boolean;
  campo: string; // nombre interno del campo en PDFs rellenables; "" si plano
}
export interface FormularioCompletado {
  campos: CampoFormulario[];
  notas: string | null;
  rellenable: boolean; // true = se puede bajar el PDF original completo
}

export function useCompletarFormulario() {
  return useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("archivo", file);
      return (
        await api.post<FormularioCompletado>("/api/v1/formularios/completar", fd, {
          timeout: 120000,
        })
      ).data;
    },
  });
}

// Rellena el PDF ORIGINAL (rellenable/AcroForm) con los valores revisados y lo
// baja ya completo.
export async function rellenarFormularioPdf(
  archivo: File,
  campos: CampoFormulario[]
): Promise<void> {
  const fd = new FormData();
  fd.append("archivo", archivo);
  fd.append("campos", JSON.stringify(campos));
  const res = await api.post("/api/v1/formularios/rellenar", fd, {
    responseType: "blob",
  });
  const disp = (res.headers["content-disposition"] as string) || "";
  const m = disp.match(/filename="?([^"]+)"?/);
  const nombre = m?.[1] ?? "formulario - completo.pdf";
  const url = window.URL.createObjectURL(res.data as Blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

// --- Destinatarios del mail a Compras ---
export interface DestinatariosCompras {
  to: string | null;
  cc: string[];
}

const COMPRAS_KEY = ["configuracion", "compras"] as const;
const COMPRAS_URL = "/api/v1/configuracion/compras";

export function useDestinatariosCompras() {
  return useQuery({
    queryKey: COMPRAS_KEY,
    queryFn: async () => (await api.get<DestinatariosCompras>(COMPRAS_URL)).data,
  });
}

export function useUpdateDestinatariosCompras() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: DestinatariosCompras) =>
      (await api.put<DestinatariosCompras>(COMPRAS_URL, body)).data,
    onSuccess: (data) => qc.setQueryData(COMPRAS_KEY, data),
  });
}

// --- Grupos de destinatarios de Compras (por usuario) ---
export interface GrupoCompras {
  id: number;
  nombre: string;
  to: string;
  cc: string[];
  es_default: boolean;
}

export type GrupoComprasInput = {
  nombre: string;
  to: string;
  cc: string[];
  es_default: boolean;
};

const GRUPOS_KEY = ["configuracion", "compras", "grupos"] as const;
const GRUPOS_URL = "/api/v1/configuracion/compras/grupos";

export function useGruposCompras() {
  return useQuery({
    queryKey: GRUPOS_KEY,
    queryFn: async () => (await api.get<GrupoCompras[]>(GRUPOS_URL)).data,
  });
}

export function useCreateGrupoCompras() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: GrupoComprasInput) =>
      (await api.post<GrupoCompras>(GRUPOS_URL, body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: GRUPOS_KEY }),
  });
}

export function useUpdateGrupoCompras() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: number; body: Partial<GrupoComprasInput> }) =>
      (await api.put<GrupoCompras>(`${GRUPOS_URL}/${id}`, body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: GRUPOS_KEY }),
  });
}

export function useDeleteGrupoCompras() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`${GRUPOS_URL}/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: GRUPOS_KEY }),
  });
}

// --- Speeches (plantillas de requerimiento a Compras, por usuario) ---
export interface Speech {
  id: number;
  titulo: string;
  texto: string;
}

export type SpeechInput = { titulo: string; texto: string };

const SPEECHES_KEY = ["configuracion", "speeches"] as const;
const SPEECHES_URL = "/api/v1/configuracion/speeches";

export function useSpeeches() {
  return useQuery({
    queryKey: SPEECHES_KEY,
    queryFn: async () => (await api.get<Speech[]>(SPEECHES_URL)).data,
  });
}

export function useCreateSpeech() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: SpeechInput) =>
      (await api.post<Speech>(SPEECHES_URL, body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: SPEECHES_KEY }),
  });
}

export function useUpdateSpeech() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: number; body: Partial<SpeechInput> }) =>
      (await api.put<Speech>(`${SPEECHES_URL}/${id}`, body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: SPEECHES_KEY }),
  });
}

export function useDeleteSpeech() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`${SPEECHES_URL}/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: SPEECHES_KEY }),
  });
}
