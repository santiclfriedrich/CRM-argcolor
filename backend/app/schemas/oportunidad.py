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


class OportunidadRead(OportunidadBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    fecha_creacion: datetime
    fecha_ultimo_movimiento: datetime
