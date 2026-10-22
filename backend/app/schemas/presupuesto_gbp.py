"""Pydantic schemas para los presupuestos a cargar en GBP por el bot."""

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from app.db.models.presupuestos_gbp import ENTREGA_OPCIONES, IVA_OPCIONES

_IVA_VALIDOS = {Decimal(v) for v in IVA_OPCIONES}


class ItemGbpIn(BaseModel):
    """Una línea del presupuesto. Si trae `sku` (código GBP) es NORMAL; si no,
    MANUAL (y el IVA pasa a ser obligatorio: 21 o 10.5)."""

    sku: str | None = None
    descripcion: str
    cantidad: Decimal = Decimal(1)
    precio_usd: Decimal = Decimal(0)
    iva: Decimal | None = None
    fabricante: str | None = None
    part_number: str | None = None

    @field_validator("sku", "descripcion", "fabricante", "part_number", mode="before")
    @classmethod
    def _strip(cls, v: object) -> object:
        return v.strip() if isinstance(v, str) else v

    @property
    def tipo(self) -> str:
        return "normal" if self.sku else "manual"

    @model_validator(mode="after")
    def _validar(self) -> "ItemGbpIn":
        if not self.descripcion:
            raise ValueError("La descripción no puede estar vacía")
        if self.cantidad <= 0:
            raise ValueError("La cantidad debe ser mayor a 0")
        if self.precio_usd < 0:
            raise ValueError("El precio no puede ser negativo")
        if not self.sku:  # manual -> IVA obligatorio y acotado
            if self.iva is None:
                raise ValueError("Ítem manual: falta el IVA")
            if self.iva not in _IVA_VALIDOS:
                raise ValueError("El IVA debe ser 21 o 10.5")
        return self


class PresupuestoGbpCreate(BaseModel):
    """Alta de un presupuesto para cargar en GBP (la pantalla de revisión del
    import lo manda cuando el humano completó cliente y entrega)."""

    oportunidad_id: int | None = None
    cliente_numero: str | None = None
    entrega_por: str | None = None
    items: list[ItemGbpIn]
    # True = encolar para el bot (pendiente); False = guardar como borrador.
    encolar: bool = True

    @field_validator("cliente_numero", "entrega_por", mode="before")
    @classmethod
    def _strip(cls, v: object) -> object:
        return v.strip() if isinstance(v, str) else v

    @field_validator("entrega_por")
    @classmethod
    def _entrega_valida(cls, v: str | None) -> str | None:
        if v and v not in ENTREGA_OPCIONES:
            raise ValueError(f"Entrega inválida. Opciones: {', '.join(ENTREGA_OPCIONES)}")
        return v

    @model_validator(mode="after")
    def _validar(self) -> "PresupuestoGbpCreate":
        if not self.items:
            raise ValueError("El presupuesto no tiene ítems")
        if self.encolar:  # para encolar al bot hace falta todo completo
            if not self.cliente_numero:
                raise ValueError("Falta el N° de cliente")
            if not self.entrega_por:
                raise ValueError("Falta la forma de entrega")
        return self


class ItemGbpRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    orden: int
    tipo: str
    sku: str | None
    descripcion: str
    cantidad: Decimal
    precio_usd: Decimal
    iva: Decimal | None
    fabricante: str | None
    part_number: str | None


class PresupuestoGbpRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    oportunidad_id: int | None
    cliente_numero: str | None
    entrega_por: str | None
    moneda: str
    documento: str
    estado_carga: str
    numero_gbp: str | None
    error_mensaje: str | None
    intentos: int
    tomado_en: datetime | None
    cargado_en: datetime | None
    created_at: datetime
    items: list[ItemGbpRead]


class PresupuestoGbpListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    oportunidad_id: int | None
    cliente_numero: str | None
    entrega_por: str | None
    estado_carga: str
    numero_gbp: str | None
    intentos: int
    created_at: datetime


# --- Payload que consume el bot ---
class ItemBotRead(BaseModel):
    tipo: str
    sku: str | None
    descripcion: str
    cantidad: Decimal
    precio_usd: Decimal
    iva: Decimal | None


class JobBotRead(BaseModel):
    """Lo que el bot necesita para cargar el presupuesto en GBP."""

    id: int
    cliente_numero: str
    entrega_por: str
    moneda: str
    documento: str
    fecha_entrega: str = "today"
    items: list[ItemBotRead]


class ErrorBotIn(BaseModel):
    mensaje: str
