// Tipos del dominio, alineados con los schemas Pydantic del backend.

export type RolCompra = "decisor" | "tecnico" | "compras" | "logistica" | "otro";

export interface Cliente {
  id: number;
  razon_social: string;
  cuit: string | null;
  numero_cliente: string | null;
  vendedor_asignado_id: number | null;
  notas: string | null;
  activo: boolean;
  cuenta_principal_id: number | null;
  tipo: string | null;
  sector: string | null;
  sitio_web: string | null;
  telefono: string | null;
  empleados: number | null;
  direccion_facturacion: string | null;
  direccion_envio: string | null;
  created_at: string;
  creado_por_id: number | null;
  creado_por: { id: number; nombre: string } | null;
}

export interface CuentaMini {
  id: number;
  razon_social: string;
}

export interface ClienteDetail extends Cliente {
  contactos: Contacto[];
  dominios: Dominio[];
  cuenta_principal: CuentaMini | null;
  subcuentas: CuentaMini[];
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
  numero_cliente?: string | null;
  vendedor_asignado_id?: number | null;
  notas?: string | null;
  activo?: boolean;
  cuenta_principal_id?: number | null;
  tipo?: string | null;
  sector?: string | null;
  sitio_web?: string | null;
  telefono?: string | null;
  empleados?: number | null;
  direccion_facturacion?: string | null;
  direccion_envio?: string | null;
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
  sync_mail_activo: boolean;
  created_at: string;
  gmail_conectado?: boolean;
  // Preferencias de UI por usuario (ej. orden de entrada por sección).
  preferencias?: Record<string, unknown> | null;
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
  sync_mail_activo?: boolean;
};

// ---- Oportunidades ----
export type EstadoOportunidad =
  | "nueva"
  | "requiere_aclaracion"
  | "en_compras"
  | "cotizado_compras"
  | "presupuestada"
  | "confirmada"
  | "pago_pendiente_entrega"
  | "entregado_pendiente_pago"
  | "finalizado"
  | "perdida";

interface ClienteMini {
  id: number;
  razon_social: string;
  numero_cliente: string | null;
}
interface PersonaMini {
  id: number;
  nombre: string;
}

export interface Comentario {
  fecha: string;
  texto: string;
  autor: string | null;
}

export interface AdjuntoOportunidad {
  id: number;
  filename: string;
  mime_type: string | null;
  // "requerimiento" = imagen pegada en el texto del requerimiento (se muestra
  // aparte de los adjuntos del cliente). Ausente en los adjuntos comunes.
  origen?: string | null;
}

export interface Oportunidad {
  id: number;
  cliente_id: number | null;
  contacto_cliente_id: number | null;
  vendedor_id: number | null;
  estado: EstadoOportunidad;
  ambito: Seccion;
  fuente: string | null;
  asunto: string | null;
  requerimiento: string | null;
  producto: string | null;
  numero_pedido: string | null;
  ing: string | null;
  observacion: string | null;
  cargada_en_gbp: boolean;
  valor_estimado: number | null;
  fecha_pedido_cliente: string | null;
  fecha_enviado_compras: string | null;
  fecha_respuesta_compras: string | null;
  fecha_enviado_cliente: string | null;
  fecha_limite: string | null;
  fecha_entrega: string | null;
  comentarios: Comentario[];
  archivos_adjuntos: AdjuntoOportunidad[] | null;
  fecha_creacion: string;
  fecha_ultimo_movimiento: string;
  fecha_cierre: string | null;
  // Sección Gubernamental (licitaciones):
  proceso: string | null;
  portal: string | null;
  apertura: string | null;
  hr_pliego: string | null;
  hr_apertura: string | null;
  moneda: string | null;
  pliego: string | null;
  empresa: string | null;
  presupuesto_url: string | null;
  cliente: ClienteMini | null;
  contacto: PersonaMini | null;
  vendedor: PersonaMini | null;
  creado_por: { id: number; nombre: string } | null;
  transferencia_para: { id: number; nombre: string } | null;
}

export type OportunidadCreate = {
  cliente_id?: number | null;
  contacto_cliente_id?: number | null;
  vendedor_id?: number | null;
  estado?: EstadoOportunidad;
  fuente?: string | null;
  asunto?: string | null;
  requerimiento?: string | null;
  producto?: string | null;
  numero_pedido?: string | null;
  ing?: string | null;
  observacion?: string | null;
  cargada_en_gbp?: boolean;
  valor_estimado?: number | null;
  fecha_pedido_cliente?: string | null;
  fecha_enviado_compras?: string | null;
  fecha_respuesta_compras?: string | null;
  fecha_enviado_cliente?: string | null;
  fecha_limite?: string | null;
  fecha_entrega?: string | null;
  ambito?: Seccion;
  proceso?: string | null;
  portal?: string | null;
  apertura?: string | null;
  hr_pliego?: string | null;
  hr_apertura?: string | null;
  moneda?: string | null;
  pliego?: string | null;
  empresa?: string | null;
  presupuesto_url?: string | null;
};
export type OportunidadUpdate = Partial<OportunidadCreate>;

// Filtros del listado de oportunidades.
export type Seccion = "corporativo" | "gubernamental";

export type OportunidadFiltros = {
  estado?: EstadoOportunidad | "";
  cliente_id?: number | null;
  ambito?: Seccion;
  desde?: string;
  hasta?: string;
  solo_mias?: boolean;
  usuario_id?: number;
};

// --- Búsqueda global ---
export interface SearchResults {
  clientes: { id: number; razon_social: string }[];
  contactos: { id: number; nombre: string; cliente_id: number | null; cliente_nombre: string | null }[];
  oportunidades: { id: number; asunto: string | null; estado: EstadoOportunidad; cliente_nombre: string | null }[];
}

// ---- Solicitudes a Compras ----
export type CondicionPago =
  | "15"
  | "30"
  | "45"
  | "60"
  | "120"
  | "Transferencia"
  | "Cheque Anticipado a Entrega - 15 días"
  | "Cheque Anticipado a Entrega - 30 días"
  | "Cheque Anticipado a Entrega - 60 días";
export type EstadoSolicitud = "enviada" | "respondida" | "cerrada";

interface SolicitudOportunidadMini {
  id: number;
  estado: EstadoOportunidad;
  asunto: string | null;
  cliente: ClienteMini | null;
}

export interface AdjuntoSolicitud {
  filename: string;
  mime_type: string | null;
  path?: string;
}

export interface Solicitud {
  id: number;
  oportunidad_id: number;
  requerimiento: string;
  numero_cliente: string | null;
  condicion_pago: CondicionPago | null;
  importe_aproximado: number | null;
  fecha_limite: string | null;
  presupuesto_gbp_referencia: string | null;
  ccs_extra: string[] | null;
  archivos_adjuntos: AdjuntoSolicitud[] | null;
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
  numero_cliente?: string | null;
  condicion_pago?: CondicionPago | null;
  importe_aproximado?: number | null;
  fecha_limite?: string | null;
  presupuesto_gbp_referencia?: string | null;
  ccs_extra?: string[] | null;
  grupo_compras_id?: number | null;
  // Refs de adjuntos de la oportunidad a incluir ("op:<id>" / "mail:<id>").
  adjuntos_oportunidad?: string[];
};

export interface AdjuntoCompras {
  ref: string;
  filename: string;
  mime_type: string;
}

// Propuesta de oportunidad (mail auto-ingestado) pendiente de revisión.
export interface Propuesta {
  id: number;
  cliente: string | null;
  asunto: string | null;
  requerimiento: string | null;
  vendedor: string | null;
  vendedor_id: number | null;
  mail_de: string | null;
  mail_para: string | null;
  recibido_en: string | null;
  mail_fecha: string | null;
  mail_cuerpo: string | null;
  adjuntos: { id: number; nombre: string; mime: string | null }[];
}
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
  asunto: string | null;
  vendedor_id: number | null;
  cliente: ClienteMini | null;
  vendedor: { id: number; nombre: string; email: string } | null;
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
  // En el listado de la bandeja NO viene el cuerpo (se trae al abrir el hilo);
  // sí en /hilo. `tiene_cuerpo` dice si mostrar "Ver conversación" en la lista.
  cuerpo?: string | null;
  tiene_cuerpo?: boolean;
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
  iva: number | null;
  subtotal: number;
  sku: string | null;
  fabricante: string | null;
  observaciones: string | null;
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
  creado_por: { id: number; nombre: string } | null;
  editado_por: { id: number; nombre: string } | null;
  editado_en: string | null;
}

// Payloads de escritura. Los ítems del armador se mandan sin id (los crea el back).
export type ItemInput = {
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  descuento_pct?: number;
  iva?: number | null;
  sku?: string | null;
  fabricante?: string | null;
  observaciones?: string | null;
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
