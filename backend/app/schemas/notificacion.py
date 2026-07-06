"""Pydantic schemas para las notificaciones in-app."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class NotificacionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    mensaje: str
    link: str | None = None
    leida: bool
    fecha_creacion: datetime
