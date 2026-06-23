"""Pydantic schemas for SolicitudCompras (formulario interno a Compras)."""

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, EmailStr

from app.db.models.solicitudes_compras import CondicionPago, EstadoSolicitud


class SolicitudBase(BaseModel):
    oportunidad_id: int
    requerimiento: str
    condicion_pago: CondicionPago | None = None
    importe_aproximado: float | None = None
    fecha_limite: date | None = None
    presupuesto_gbp_referencia: str | None = None
    ccs_extra: list[EmailStr] | None = None


class SolicitudCreate(SolicitudBase):
    pass


class SolicitudUpdate(BaseModel):
    requerimiento: str | None = None
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
    cliente: ClienteMini | None = None


class SolicitanteMini(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nombre: str


class SolicitudRead(SolicitudBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    estado: EstadoSolicitud
    fecha_envio: datetime | None = None
    fecha_respuesta: datetime | None = None
    created_at: datetime
    oportunidad: OportunidadMini | None = None
    solicitante: SolicitanteMini | None = None


class EmailPreview(BaseModel):
    """Borrador del mail a Compras (envío real = Fase 2 con Gmail API)."""

    to: str | None = None
    cc: list[str] = []
    subject: str
    body: str


class SolicitudDetail(SolicitudRead):
    email_preview: EmailPreview
