"""Pydantic schemas for Cliente."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.contacto import ContactoRead
from app.schemas.dominio import DominioRead


class ClienteBase(BaseModel):
    razon_social: str
    cuit: str | None = None
    vendedor_asignado_id: int | None = None
    notas: str | None = None
    activo: bool = True


class ClienteCreate(ClienteBase):
    pass


class ClienteUpdate(BaseModel):
    razon_social: str | None = None
    cuit: str | None = None
    vendedor_asignado_id: int | None = None
    notas: str | None = None
    activo: bool | None = None


class ClienteRead(ClienteBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime


class ClienteDetail(ClienteRead):
    """Cliente con sus contactos y dominios anidados (vista de ficha)."""

    contactos: list[ContactoRead] = []
    dominios: list[DominioRead] = []
