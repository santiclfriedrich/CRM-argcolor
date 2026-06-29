"""Pydantic schemas para la bandeja de mails y la ingesta manual."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.db.models.mails import DireccionMail
from app.integrations.ai.base import EmailData


class IngestEmailRequest(BaseModel):
    """Mail pegado manualmente para procesar con la IA."""

    de: str
    asunto: str | None = None
    cuerpo: str
    para: str | None = None
    fecha: datetime | None = None


class ClienteMini(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    razon_social: str


class OportunidadMini(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    estado: str
    cliente: ClienteMini | None = None


class MailRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    direccion: DireccionMail
    de: str | None = None
    para: str | None = None
    asunto: str | None = None
    cuerpo: str | None = None
    fecha: datetime | None = None
    oportunidad_id: int | None = None
    datos_extraidos_ia: EmailData | None = None
    created_at: datetime
    oportunidad: OportunidadMini | None = None
