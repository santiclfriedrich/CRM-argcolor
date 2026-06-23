"""Pydantic schemas for Oportunidad."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.db.models.oportunidades import EstadoOportunidad


class OportunidadBase(BaseModel):
    cliente_id: int | None = None
    contacto_cliente_id: int | None = None
    vendedor_id: int | None = None
    estado: EstadoOportunidad = EstadoOportunidad.nueva
    fuente: str | None = None


class OportunidadCreate(OportunidadBase):
    pass


class OportunidadUpdate(BaseModel):
    cliente_id: int | None = None
    contacto_cliente_id: int | None = None
    vendedor_id: int | None = None
    estado: EstadoOportunidad | None = None
    fuente: str | None = None


# Mini-objetos anidados para mostrar nombres en el listado sin un segundo fetch.
class ClienteMini(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    razon_social: str


class ContactoMini(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nombre: str


class VendedorMini(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nombre: str


class OportunidadRead(OportunidadBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    fecha_creacion: datetime
    fecha_ultimo_movimiento: datetime
    cliente: ClienteMini | None = None
    contacto: ContactoMini | None = None
    vendedor: VendedorMini | None = None
