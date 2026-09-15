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


class ResponderRequest(BaseModel):
    """Respuesta de texto libre que el vendedor escribe desde la bandeja."""

    cuerpo: str
    asunto: str | None = None


class AclaracionBody(BaseModel):
    """Aclaración a enviar. Si `cuerpo` viene, se manda ese texto (borrador
    editado a mano); si no, se usa el que redactó la IA."""

    cuerpo: str | None = None


class ClienteMini(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    razon_social: str


class VendedorMini(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nombre: str
    email: str  # la casilla que recibió el mail


class OportunidadMini(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    estado: str
    vendedor_id: int | None = None
    cliente: ClienteMini | None = None
    vendedor: VendedorMini | None = None


class AdjuntoRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nombre_archivo: str
    mime_type: str | None = None


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
    archivos: list[AdjuntoRead] = []


class MailListItem(BaseModel):
    """Versión del listado de la bandeja SIN el cuerpo del mail.

    La bandeja muestra remitente/asunto/fecha/extracción, pero no el cuerpo: ese
    se trae al abrir la conversación (endpoint /hilo). Omitir el cuerpo acá evita
    arrastrar el texto completo de cada mail en cada carga de la bandeja.
    `tiene_cuerpo` viene computado en SQL para saber si mostrar "Ver conversación".
    """

    model_config = ConfigDict(from_attributes=True)

    id: int
    direccion: DireccionMail
    de: str | None = None
    para: str | None = None
    asunto: str | None = None
    tiene_cuerpo: bool = False
    fecha: datetime | None = None
    oportunidad_id: int | None = None
    datos_extraidos_ia: EmailData | None = None
    created_at: datetime
    oportunidad: OportunidadMini | None = None
    archivos: list[AdjuntoRead] = []


class InboxMailListItem(BaseModel):
    """Fila del inbox del CRM (bandeja tipo Gmail): remitente/asunto/preview/estado.

    No trae el cuerpo completo (egress): solo un `preview` recortado en SQL. El
    texto entero se pide al abrir la conversación (/hilo)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    direccion: DireccionMail
    de: str | None = None
    para: str | None = None
    asunto: str | None = None
    fecha: datetime | None = None
    leido: bool = False
    carpeta: str | None = None
    gmail_thread_id: str | None = None
    tiene_cuerpo: bool = False
    tiene_adjuntos: bool = False
    preview: str | None = None


class AdjuntoGmail(BaseModel):
    """Adjunto de un mail (metadatos; los bytes se bajan a demanda)."""

    filename: str
    mime: str | None = None
    size: int = 0
    attachment_id: str
    message_id: str


class ConversacionMensaje(BaseModel):
    """Un mensaje del hilo tal cual viene de Gmail: HTML real + adjuntos."""

    message_id: str | None = None
    de: str | None = None
    para: str | None = None
    asunto: str | None = None
    fecha: datetime | None = None
    html: str | None = None
    texto: str = ""
    adjuntos: list[AdjuntoGmail] = []


class RedactarRequest(BaseModel):
    """Correo nuevo redactado desde el CRM."""

    para: str
    asunto: str | None = None
    cuerpo: str


class LeidoBody(BaseModel):
    """Marcar un mail como leído/no leído (local al CRM)."""

    leido: bool = True


class DescartadoRead(BaseModel):
    """Mail que la IA clasificó como no comercial (registro mínimo)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    categoria: str
    de: str | None = None
    asunto: str | None = None
    fecha: datetime | None = None
    created_at: datetime


class IngestResult(BaseModel):
    """Resultado de la ingesta manual: el mail creado, o un aviso de descarte
    si la IA lo clasificó como no comercial (sin crear oportunidad)."""

    descartado: bool = False
    categoria: str | None = None
    mail: MailRead | None = None
