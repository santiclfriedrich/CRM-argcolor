"""Pydantic schemas for SolicitudCompras (formulario interno a Compras)."""

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, EmailStr

from app.db.models.solicitudes_compras import CondicionPago, EstadoSolicitud
from app.integrations.ai.base import QuoteDraft


class SolicitudBase(BaseModel):
    oportunidad_id: int
    requerimiento: str
    numero_cliente: str | None = None
    condicion_pago: CondicionPago | None = None
    importe_aproximado: float | None = None
    fecha_limite: date | None = None
    presupuesto_gbp_referencia: str | None = None
    ccs_extra: list[EmailStr] | None = None


class SolicitudCreate(SolicitudBase):
    pass


class SolicitudUpdate(BaseModel):
    requerimiento: str | None = None
    numero_cliente: str | None = None
    condicion_pago: CondicionPago | None = None
    importe_aproximado: float | None = None
    fecha_limite: date | None = None
    presupuesto_gbp_referencia: str | None = None
    ccs_extra: list[EmailStr] | None = None
    estado: EstadoSolicitud | None = None


# Mini-objetos anidados para mostrar nombres en el listado.
class ClienteMini(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    razon_social: str


class OportunidadMini(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    estado: str
    asunto: str | None = None
    cliente: ClienteMini | None = None


class SolicitanteMini(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nombre: str


class RespuestaComprasRead(BaseModel):
    """Respuesta de Compras parseada por la IA (ítems para el presupuesto)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    contenido_raw: str | None = None
    datos_parseados_ia: QuoteDraft | None = None
    notas_compras: str | None = None
    fecha_recepcion: datetime


class SolicitudRead(SolicitudBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    estado: EstadoSolicitud
    gmail_thread_id: str | None = None
    fecha_envio: datetime | None = None
    fecha_respuesta: datetime | None = None
    created_at: datetime
    archivos_adjuntos: list[dict] | None = None
    oportunidad: OportunidadMini | None = None
    solicitante: SolicitanteMini | None = None


class EmailPreview(BaseModel):
    """Borrador del mail a Compras."""

    to: str | None = None
    cc: list[str] = []
    subject: str
    body: str


class ParseRespuestaRequest(BaseModel):
    """Texto de la respuesta de Compras a parsear con la IA."""

    contenido: str


class SugerenciaCompras(BaseModel):
    """Requerimiento pre-armado desde lo que la IA extrajo del mail del cliente."""

    requerimiento: str


class SolicitudDetail(SolicitudRead):
    email_preview: EmailPreview
    respuestas: list[RespuestaComprasRead] = []
