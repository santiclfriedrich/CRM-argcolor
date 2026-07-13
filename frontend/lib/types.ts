// Tipos del dominio, alineados con los schemas Pydantic del backend.

export type RolCompra = "decisor" | "tecnico" | "compras" | "logistica" | "otro";

export interface Cliente {
  id: number;
  razon_social: string;
  cuit: string | null;
  vendedor_asignado_id: number | null;
  notas: string | null;
  activo: boolean;
  created_at: string;
}

export interface ClienteDetail extends Cliente {
  contactos: Contacto[];
  dominios: Dominio[];
}

export interface Contacto {
  id: number;
  cliente_id: number;
  nombre: string;
  email: string | null;
  telefono: string | null;
  cargo: string | null;
  rol_compra: RolCompra;
  es_principal: boolean;
  activo: boolean;
  notas: string | null;
  created_at: string;
}

export interface Dominio {
  id: number;
  cliente_id: number;
  dominio: string;
  es_principal_dominio: boolean;
  notas: string | null;
  created_at: string;
}

// Payloads de escritura (lo que aceptan los endpoints).
export type ClienteCreate = {
  razon_social: string;
  cuit?: string | null;
  vendedor_asignado_id?: number | null;
  notas?: string | null;
  activo?: boolean;
};
export type ClienteUpdate = Partial<ClienteCreate>;

export type ContactoCreate = {
  nombre: string;
  email?: string | null;
  telefono?: string | null;
  cargo?: string | null;
  rol_compra?: RolCompra;
  es_principal?: boolean;
  activo?: boolean;
  notas?: string | null;
};
export type ContactoUpdate = Partial<ContactoCreate>;

export type DominioCreate = {
  dominio: string;
  es_principal_dominio?: boolean;
  notas?: string | null;
};
export type DominioUpdate = Partial<DominioCreate>;

// ---- Usuarios ----
export type RolUsuario = "vendedor" | "admin" | "compras";

export interface Usuario {
  id: number;
  email: string;
  nombre: string;
  rol: RolUsuario;
  activo: boolean;
  created_at: string;
  gmail_conectado?: boolean;
}

export type UsuarioCreate = {
  email: string;
  nombre: string;
  rol?: RolUsuario;
  activo?: boolean;
};
export type UsuarioUpdate = {
  nombre?: string;
  rol?: RolUsuario;
  activo?: boolean;
};

// ---- Oportunidades ----
export type EstadoOportunidad =
  | "nueva"
  | "requiere_aclaracion"
  | "en_compras"
  | "presupuestada"
  | "ganada"
  | "cargada_en_gbp"
  | "facturada"
  | "perdida";

interface ClienteMini {
  id: number;
  razon_social: string;
}
interface PersonaMini {
  id: number;
  nombre: string;
}

export interface Oportunidad {
  id: number;
  cliente_id: number | null;
  contacto_cliente_id: number | null;
  vendedor_id: number | null;
  estado: EstadoOportunidad;
  fuente: string | null;
  fecha_creacion: string;
  fecha_ultimo_movimiento: string;
  cliente: ClienteMini | null;
  contacto: PersonaMini | null;
  vendedor: PersonaMini | null;
}

export type OportunidadCreate = {
  cliente_id?: number | null;
  contacto_cliente_id?: number | null;
  vendedor_id?: number | null;
  estado?: EstadoOportunidad;
  fuente?: string | null;
};
export type OportunidadUpdate = Partial<OportunidadCreate>;

// ---- Solicitudes a Compras ----
export type CondicionPago = "15" | "30" | "45" | "60" | "120" | "Transferencia";
export type EstadoSolicitud = "enviada" | "respondida" | "cerrada";

interface SolicitudOportunidadMini {
  id: number;
  estado: EstadoOportunidad;
  cliente: ClienteMini | null;
}

export interface Solicitud {
  id: number;
  oportunidad_id: number;
  requerimiento: string;
  condicion_pago: CondicionPago | null;
  importe_aproximado: number | null;
  fecha_limite: string | null;
  presupuesto_gbp_referencia: string | null;
  ccs_extra: string[] | null;
  estado: EstadoSolicitud;
  gmail_thread_id: string | null;
  fecha_envio: string | null;
  fecha_respuesta: string | null;
  created_at: string;
  oportunidad: SolicitudOportunidadMini | null;
  solicitante: PersonaMini | null;
}

// Ítem parseado por la IA de la respuesta de Compras.
export interface QuoteItem {
  fabricante: string | null;
  sku: string | null;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  iva: number | null;
  observaciones: string | null;
}

export interface QuoteDraft {
  items: QuoteItem[];
  notas: string | null;
}

export interface RespuestaCompras {
  id: number;
  contenido_raw: string | null;
  datos_parseados_ia: QuoteDraft | null;
  notas_compras: string | null;
  fecha_recepcion: string;
}

export interface EmailPreview {
  to: string | null;
  cc: string[];
  subject: string;
  body: string;
}

export interface SolicitudDetail extends Solicitud {
  email_preview: EmailPreview;
  respuestas: RespuestaCompras[];
}

export type SolicitudCreate = {
  oportunidad_id: number;
  requerimiento: string;
  condicion_pago?: CondicionPago | null;
  importe_aproximado?: number | null;
  fecha_limite?: string | null;
  presupuesto_gbp_referencia?: string | null;
  ccs_extra?: string[] | null;
};
export type SolicitudUpdate = Partial<Omit<SolicitudCreate, "oportunidad_id">> & {
  estado?: EstadoSolicitud;
};

// ---- Bandeja / Mails ----
export type CategoriaMail =
  | "consulta_comercial"
  | "orden_compra"
  | "administrativo"
  | "otro";

export interface EmailData {
  categoria: CategoriaMail;
  cliente_sugerido: string | null;
  producto: string | null;
  cantidad: string | null;
  requerimiento: string | null;
  plazo: string | null;
  requiere_aclaracion: boolean;
  borrador_aclaracion: string | null;
}

interface MailOportunidadMini {
  id: number;
  estado: EstadoOportunidad;
  vendedor_id: number | null;
  cliente: ClienteMini | null;
}

export interface Adjunto {
  id: number;
  nombre_archivo: string;
  mime_type: string | null;
}

export interface Mail {
  id: number;
  direccion: "entrante" | "saliente";
  de: string | null;
  para: string | null;
  asunto: string | null;
  cuerpo: string | null;
  fecha: string | null;
  oportunidad_id: number | null;
  datos_extraidos_ia: EmailData | null;
  created_at: string;
  oportunidad: MailOportunidadMini | null;
  archivos: Adjunto[];
}

export type IngestEmailRequest = {
  de: string;
  asunto?: string | null;
  cuerpo: string;
  para?: string | null;
};

// Resultado de la ingesta: el mail creado, o un aviso de descarte si la IA lo
// clasificó como no comercial (orden de compra, facturación, etc.).
export interface IngestResult {
  descartado: boolean;
  categoria: CategoriaMail | null;
  mail: Mail | null;
}

// Mail que la IA descartó por no ser una consulta comercial (registro mínimo).
export interface MailDescartado {
  id: number;
  categoria: CategoriaMail;
  de: string | null;
  asunto: string | null;
  fecha: string | null;
  created_at: string;
}

// ---- Notificaciones in-app ----
export interface Notificacion {
  id: number;
  mensaje: string;
  link: string | null;
  leida: boolean;
  fecha_creacion: string;
}

// ---- Presupuestos ----
export type EstadoPresupuesto =
  | "borrador"
  | "enviado"
  | "aceptado"
  | "rechazado"
  | "negociando";

export interface PresupuestoItem {
  id: number;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  descuento_pct: number;
  subtotal: number;
  sku: string | null;
  fabricante: string | null;
  orden: number;
}

export interface Presupuesto {
  id: number;
  oportunidad_id: number;
  codigo: string;
  estado: EstadoPresupuesto;
  monto_total: number | null;
  moneda: string;
  condicion_pago: string | null;
  plazo_entrega: string | null;
  validez: string | null;
  version: number;
  pdf_url: string | null;
  fecha_envio: string | null;
  fecha_validez: string | null;
  created_at: string;
  items: PresupuestoItem[];
  oportunidad: MailOportunidadMini | null;
}

// Payloads de escritura. Los ítems del armador se mandan sin id (los crea el back).
export type ItemInput = {
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  descuento_pct?: number;
  sku?: string | null;
  fabricante?: string | null;
};

export type PresupuestoCreate = {
  oportunidad_id: number;
  condicion_pago?: string | null;
  plazo_entrega?: string | null;
  validez?: string | null;
  moneda?: string;
  items?: ItemInput[];
};

export type PresupuestoUpdate = {
  condicion_pago?: string | null;
  plazo_entrega?: string | null;
  validez?: string | null;
  moneda?: string;
  estado?: EstadoPresupuesto;
  items?: ItemInput[];
};
