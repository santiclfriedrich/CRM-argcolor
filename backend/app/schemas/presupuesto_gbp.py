"""Schemas del payload que intercambia el bot de carga de presupuestos en GBP.

El presupuesto en sí es el `Presupuesto` del CRM (schemas en presupuesto.py);
acá solo va lo que el bot necesita para cargarlo y lo que reporta.
"""

from decimal import Decimal

from pydantic import BaseModel


class ItemBotRead(BaseModel):
    tipo: str  # "normal" (con SKU de GBP) | "manual"
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
