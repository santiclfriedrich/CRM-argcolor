"""Pydantic schemas para presupuestos (cotizaciones) y sus ítems."""

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, EmailStr, field_validator

from app.db.models.presupuestos import SUCURSALES_GBP, EstadoPresupuesto


def _validar_sucursal(v: str | None) -> str | None:
    if v is not None and v not in SUCURSALES_GBP:
        raise ValueError(f"Sucursal inválida. Opciones: {', '.join(SUCURSALES_GBP)}")
    return v


class EnviarPresupuestoRequest(BaseModel):
    """Datos para enviar el presupuesto al cliente. Si no se pasa `to`, se usa
    el email del contacto de la oportunidad."""

    to: EmailStr | None = None
    mensaje: str | None = None


class ItemBase(BaseModel):
    descripcion: str
    cantidad: Decimal = Decimal(1)
    precio_unitario: Decimal = Decimal(0)
    moneda: str = "USD"  # moneda del ítem (USD | ARS)
    descuento_pct: Decimal = Decimal(0)
    iva: Decimal | None = None
    sku: str | None = None
    fabricante: str | None = None
    part_number: str | None = None
    observaciones: str | None = None


class ItemOmitido(BaseModel):
    """Un ítem que GBP no dejó cargar (lo reporta el bot en /resultado)."""

    linea: int | None = None
    sku: str | None = None
    descripcion: str | None = None
    motivo: str | None = None


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
    # Opcional: standalone (solo cliente) o colgado de una oportunidad.
    oportunidad_id: int | None = None
    cliente_id: int | None = None
    cliente_numero: str | None = None
    entrega_por: str | None = None
    documento: str = "Presupuesto USD"
    sucursal: str = "1"
    items: list[ItemBase] = []

    _suc = field_validator("sucursal")(_validar_sucursal)


class PresupuestoUpdate(PresupuestoBase):
    # Todo opcional: solo se pisa lo que venga. Si mandás items, reemplazan a los
    # actuales (el armador manda la lista completa en cada guardado).
    condicion_pago: str | None = None
    moneda: str | None = None
    estado: EstadoPresupuesto | None = None
    entrega_por: str | None = None
    cliente_numero: str | None = None
    documento: str | None = None
    sucursal: str | None = None
    items: list[ItemBase] | None = None

    _suc = field_validator("sucursal")(_validar_sucursal)


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


class UsuarioMini(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nombre: str


class PresupuestoRead(PresupuestoBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    oportunidad_id: int | None = None
    cliente_numero: str | None = None
    entrega_por: str | None = None
    documento: str = "Presupuesto USD"
    sucursal: str = "1"
    codigo: str
    estado: EstadoPresupuesto
    estado_carga: str | None = None
    id_gbp_pedido: str | None = None
    gbp_error: str | None = None
    gbp_grupo: str | None = None
    gbp_parte: int | None = None
    items_omitidos: list[ItemOmitido] = []
    monto_total: Decimal | None = None
    version: int

    @field_validator("items_omitidos", mode="before")
    @classmethod
    def _omitidos_no_none(cls, v: object) -> object:
        return v or []  # la columna puede ser None (presupuestos viejos)
    pdf_url: str | None = None
    fecha_envio: datetime | None = None
    fecha_respuesta_cliente: datetime | None = None
    fecha_validez: date | None = None
    created_at: datetime
    items: list[ItemRead] = []
    oportunidad: OportunidadMini | None = None
    creado_por: UsuarioMini | None = None
    editado_por: UsuarioMini | None = None
    editado_en: datetime | None = None


class PresupuestoListItem(BaseModel):
    """Fila del listado de presupuestos: sin los ítems (líneas del presupuesto),
    que solo usa el detalle (con su propio fetch). Es el mayor peso por fila."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    oportunidad_id: int | None = None
    cliente_numero: str | None = None
    codigo: str
    estado: EstadoPresupuesto
    estado_carga: str | None = None
    id_gbp_pedido: str | None = None
    gbp_error: str | None = None
    gbp_grupo: str | None = None
    gbp_parte: int | None = None
    sucursal: str = "1"
    cant_omitidos: int = 0
    monto_total: Decimal | None = None
    moneda: str = "USD"
    # Totales reales por moneda de los ítems ({"ARS": "123.00", "USD": "45.00"}).
    totales_por_moneda: dict[str, Decimal] = {}
    created_at: datetime
    oportunidad: OportunidadMini | None = None
    creado_por: UsuarioMini | None = None
