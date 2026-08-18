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


class UsuarioMini(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nombre: str


class ClienteRead(ClienteBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    creado_por_id: int | None = None
    creado_por: UsuarioMini | None = None


class ClienteListItem(BaseModel):
    """Versión liviana para el listado de cuentas (~8k filas).

    Solo los campos que consumen la tabla y los pickers; se dejan afuera los
    campos de texto largo (notas, direcciones, etc.) para no arrastrar megas de
    egress en cada carga del listado. Para la ficha completa está ClienteDetail.
    """

    model_config = ConfigDict(from_attributes=True)

    id: int
    razon_social: str
    cuit: str | None = None
    numero_cliente: str | None = None
    activo: bool = True
    vendedor_asignado_id: int | None = None
    created_at: datetime
    creado_por: UsuarioMini | None = None


class ClienteDetail(ClienteRead):
    """Cliente con sus contactos, dominios y jerarquía (vista de ficha)."""

    contactos: list[ContactoRead] = []
    dominios: list[DominioRead] = []
    cuenta_principal: CuentaMini | None = None
    subcuentas: list[CuentaMini] = []
