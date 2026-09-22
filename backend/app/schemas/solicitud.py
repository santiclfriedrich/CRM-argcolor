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
    # Grupo de destinatarios de Compras elegido (del usuario). Si es None, se
    # usa el grupo default del usuario; si no tiene, el destinatario global.
    grupo_compras_id: int | None = None
    # Refs de adjuntos de la oportunidad a incluir en el mail a Compras
    # ("op:<id>" / "mail:<id>"). Lo elige el usuario en el modal.
    adjuntos_oportunidad: list[str] = []


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


class SolicitudListItem(SolicitudBase):
    """Fila del listado: sin `archivos_adjuntos` (JSON). El detalle
    (SolicitudDetail) trae adjuntos y respuestas. Mantiene `requerimiento`,
    que sí se muestra en las listas."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    estado: EstadoSolicitud
    gmail_thread_id: str | None = None
    fecha_envio: datetime | None = None
    fecha_respuesta: datetime | None = None
    created_at: datetime
    oportunidad: OportunidadMini | None = None
    solicitante: SolicitanteMini | None = None


class EmailPreview(BaseModel):
    """Borrador del mail a Compras."""

    to: str | None = None
    cc: list[str] = []
    subject: str
    body: str
    html: str | None = None


class ParseRespuestaRequest(BaseModel):
    """Texto de la respuesta de Compras a parsear con la IA."""

    contenido: str


class ResponderComprasBody(BaseModel):
    """Respuesta de cotización cargada por Compras dentro del CRM (sin IA)."""

    cuerpo: str
    enviar_mail: bool = True


class SugerenciaCompras(BaseModel):
    """Requerimiento pre-armado desde lo que la IA extrajo del mail del cliente."""

    requerimiento: str


class SolicitudDetail(SolicitudRead):
    email_preview: EmailPreview
    respuestas: list[RespuestaComprasRead] = []
