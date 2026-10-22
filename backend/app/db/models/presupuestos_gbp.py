"""Modelo: presupuestos a cargar en GBP por el bot (worker self-hosted).

Entidad desacoplada del `Presupuesto` del CRM: nace de importar un Excel de
Compras, el humano la completa (N° de cliente, forma de entrega) y queda en una
cola que el bot de Playwright consume. El bot carga el presupuesto en GBP, sube
el PDF generado y marca el resultado. El ciclo de carga (estado_carga) es:

    borrador -> pendiente -> en_proceso -> cargado | error

El bot solo ve los `pendiente`. `borrador` = importado pero falta completar.
"""

import enum
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class EstadoCargaGbp(str, enum.Enum):
    borrador = "borrador"  # importado del Excel; falta completar (cliente/entrega)
    pendiente = "pendiente"  # listo; el bot lo puede tomar
    en_proceso = "en_proceso"  # el bot lo está cargando en GBP
    cargado = "cargado"  # ok: con numero_gbp + pdf
    error = "error"  # falló: con error_mensaje


# Opciones de "Entregar por" que ofrece GBP (elegibles en el CRM).
ENTREGA_OPCIONES = ("Retiro TML - Garin", "TML Corpo")

# IVA válidos (el dropdown de GBP solo tiene estos dos).
IVA_OPCIONES = (Decimal("21"), Decimal("10.5"))


class PresupuestoGbp(Base, TimestampMixin):
    __tablename__ = "presupuesto_gbp"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Link opcional a la oportunidad (un presupuesto puede ser standalone).
    oportunidad_id: Mapped[int | None] = mapped_column(
        ForeignKey("oportunidades.id"), index=True
    )
    cliente_numero: Mapped[str | None] = mapped_column(String(40), index=True)
    entrega_por: Mapped[str | None] = mapped_column(String(40))
    moneda: Mapped[str] = mapped_column(String(3), default="USD", nullable=False)
    documento: Mapped[str] = mapped_column(
        String(40), default="Presupuesto USD", nullable=False
    )

    # Ciclo de carga a GBP (lo consume el bot). Guardado como texto (sin enum
    # nativo) para no sufrir ALTER TYPE en cada cambio de estados.
    estado_carga: Mapped[str] = mapped_column(
        String(20), default=EstadoCargaGbp.borrador.value, nullable=False, index=True
    )
    numero_gbp: Mapped[str | None] = mapped_column(String(80), index=True)
    pdf_key: Mapped[str | None] = mapped_column(String(500))
    error_mensaje: Mapped[str | None] = mapped_column(Text)
    intentos: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    tomado_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cargado_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    creado_por_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"))

    oportunidad = relationship("Oportunidad")
    creado_por = relationship("Usuario")
    items = relationship(
        "PresupuestoGbpItem",
        back_populates="presupuesto",
        order_by="PresupuestoGbpItem.orden",
        cascade="all, delete-orphan",
    )


class PresupuestoGbpItem(Base):
    __tablename__ = "presupuesto_gbp_item"

    id: Mapped[int] = mapped_column(primary_key=True)
    presupuesto_gbp_id: Mapped[int] = mapped_column(
        ForeignKey("presupuesto_gbp.id", ondelete="CASCADE"), nullable=False, index=True
    )
    orden: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # "normal" = con SKU de GBP (autocompleta); "manual" = solo descripción.
    tipo: Mapped[str] = mapped_column(String(10), nullable=False)
    sku: Mapped[str | None] = mapped_column(String(120))
    descripcion: Mapped[str] = mapped_column(Text, nullable=False)
    cantidad: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=1, nullable=False)
    precio_usd: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0, nullable=False)
    iva: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))  # 21 o 10.5 (solo manual)
    fabricante: Mapped[str | None] = mapped_column(String(120))
    part_number: Mapped[str | None] = mapped_column(String(120))

    presupuesto = relationship("PresupuestoGbp", back_populates="items")
