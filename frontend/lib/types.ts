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
