"""Pydantic schemas for Cliente."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.contacto import ContactoRead
from app.schemas.dominio import DominioRead


class ClienteBase(BaseModel):
    razon_social: str
    cuit: str | None = None
    numero_cliente: str | None = None
    vendedor_asignado_id: int | None = None
    notas: str | None = None
    activo: bool = True
    cuenta_principal_id: int | None = None
    tipo: str | None = None
    sector: str | None = None
    sitio_web: str | None = None
    telefono: str | None = None
    empleados: int | None = None
    direccion_facturacion: str | None = None
    direccion_envio: str | None = None


class ClienteCreate(ClienteBase):
    pass


class ClienteUpdate(BaseModel):
    razon_social: str | None = None
    cuit: str | None = None
    numero_cliente: str | None = None
    vendedor_asignado_id: int | None = None
    notas: str | None = None
    activo: bool | None = None
    cuenta_principal_id: int | None = None
    tipo: str | None = None
    sector: str | None = None
    sitio_web: str | None = None
    telefono: str | None = None
    empleados: int | None = None
    direccion_facturacion: str | None = None
    direccion_envio: str | None = None


class CuentaMini(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    razon_social: str


class ClienteRead(ClienteBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime


class ClienteDetail(ClienteRead):
    """Cliente con sus contactos, dominios y jerarquía (vista de ficha)."""

    contactos: list[ContactoRead] = []
    dominios: list[DominioRead] = []
    cuenta_principal: CuentaMini | None = None
    subcuentas: list[CuentaMini] = []
