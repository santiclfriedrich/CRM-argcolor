"""Modelo: presupuestos (cotizaciones armadas dentro del CRM)."""

import enum
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, Enum, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class EstadoPresupuesto(str, enum.Enum):
    borrador = "borrador"
    enviado = "enviado"
    aceptado = "aceptado"
    rechazado = "rechazado"
    negociando = "negociando"


class Presupuesto(Base, TimestampMixin):
    __tablename__ = "presupuestos"

    id: Mapped[int] = mapped_column(primary_key=True)
    oportunidad_id: Mapped[int] = mapped_column(ForeignKey("oportunidades.id"), nullable=False)
    codigo: Mapped[str] = mapped_column(String(20), unique=True, index=True, nullable=False)
    monto_total: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    moneda: Mapped[str] = mapped_column(String(3), default="USD", nullable=False)
    condicion_pago: Mapped[str | None] = mapped_column(String(40))
    plazo_entrega: Mapped[str | None] = mapped_column(String(120))
    validez: Mapped[str | None] = mapped_column(String(120))
    pdf_url: Mapped[str | None] = mapped_column(String(500))
    qr_url: Mapped[str | None] = mapped_column(String(500))
    fecha_envio: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    fecha_respuesta_cliente: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    estado: Mapped[EstadoPresupuesto] = mapped_column(
        Enum(EstadoPresupuesto, name="estado_presupuesto"),
        default=EstadoPresupuesto.borrador,
        nullable=False,
        index=True,
    )
    id_gbp_pedido: Mapped[str | None] = mapped_column(String(80), index=True)
    id_gbp_factura: Mapped[str | None] = mapped_column(String(80), index=True)
    fecha_validez: Mapped[date | None] = mapped_column(Date)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    # Auditoría: quién lo creó y quién lo editó por última vez.
    creado_por_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"))
    editado_por_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"))
    editado_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    oportunidad = relationship("Oportunidad", back_populates="presupuestos")
    creado_por = relationship("Usuario", foreign_keys=[creado_por_id])
    editado_por = relationship("Usuario", foreign_keys=[editado_por_id])
    items = relationship(
        "PresupuestoItem", back_populates="presupuesto", order_by="PresupuestoItem.orden"
    )
