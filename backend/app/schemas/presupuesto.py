"""Pydantic schemas para presupuestos (cotizaciones) y sus ítems."""

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, EmailStr

from app.db.models.presupuestos import EstadoPresupuesto


class EnviarPresupuestoRequest(BaseModel):
    """Datos para enviar el presupuesto al cliente. Si no se pasa `to`, se usa
    el email del contacto de la oportunidad."""

    to: EmailStr | None = None
    mensaje: str | None = None


class ItemBase(BaseModel):
    descripcion: str
    cantidad: Decimal = Decimal(1)
    precio_unitario: Decimal = Decimal(0)
    descuento_pct: Decimal = Decimal(0)
    sku: str | None = None
    fabricante: str | None = None


class ItemRead(ItemBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    subtotal: Decimal
    orden: int


class PresupuestoBase(BaseModel):
    condicion_pago: str | None = None
    plazo_entrega: str | None = None
    validez: str | None = None
    moneda: str = "USD"


class PresupuestoCreate(PresupuestoBase):
    oportunidad_id: int
    items: list[ItemBase] = []


class PresupuestoUpdate(PresupuestoBase):
    # Todo opcional: solo se pisa lo que venga. Si mandás items, reemplazan a los
    # actuales (el armador manda la lista completa en cada guardado).
    condicion_pago: str | None = None
    moneda: str | None = None
    estado: EstadoPresupuesto | None = None
    items: list[ItemBase] | None = None


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


class PresupuestoRead(PresupuestoBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    oportunidad_id: int
    codigo: str
    estado: EstadoPresupuesto
    monto_total: Decimal | None = None
    version: int
    pdf_url: str | None = None
    fecha_envio: datetime | None = None
    fecha_respuesta_cliente: datetime | None = None
    fecha_validez: date | None = None
    created_at: datetime
    items: list[ItemRead] = []
    oportunidad: OportunidadMini | None = None
