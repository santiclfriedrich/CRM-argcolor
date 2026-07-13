"""Pydantic schemas para las tareas (agenda / to-do)."""

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict

from app.db.models.tareas import PrioridadTarea


class TareaBase(BaseModel):
    titulo: str
    descripcion: str | None = None
    subtipo: str | None = None
    fecha_vencimiento: date | None = None
    prioridad: PrioridadTarea = PrioridadTarea.media
    recordatorio: datetime | None = None
    oportunidad_id: int | None = None
    cliente_id: int | None = None


class TareaCreate(TareaBase):
    completada: bool = False


class TareaUpdate(BaseModel):
    titulo: str | None = None
    descripcion: str | None = None
    subtipo: str | None = None
    fecha_vencimiento: date | None = None
    prioridad: PrioridadTarea | None = None
    recordatorio: datetime | None = None
    completada: bool | None = None
    oportunidad_id: int | None = None
    cliente_id: int | None = None


class ClienteMini(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    razon_social: str


class OportunidadMini(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    asunto: str | None = None


class UsuarioMini(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nombre: str


class TareaRead(TareaBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    completada: bool
    fecha_completada: datetime | None = None
    created_at: datetime
    updated_at: datetime
    cliente: ClienteMini | None = None
    oportunidad: OportunidadMini | None = None
    usuario: UsuarioMini | None = None
