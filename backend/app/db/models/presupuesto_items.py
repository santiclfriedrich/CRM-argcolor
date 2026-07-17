"""Modelo: presupuesto_items (líneas de un presupuesto)."""

from decimal import Decimal

from sqlalchemy import ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class PresupuestoItem(Base):
    __tablename__ = "presupuesto_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    presupuesto_id: Mapped[int] = mapped_column(ForeignKey("presupuestos.id"), nullable=False)
    producto_id: Mapped[int | None] = mapped_column(ForeignKey("productos.id"))
    descripcion: Mapped[str] = mapped_column(Text, nullable=False)
    cantidad: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=1, nullable=False)
    precio_unitario: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0, nullable=False)
    descuento_pct: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=0, nullable=False)
    iva: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))  # % de IVA de la línea
    subtotal: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0, nullable=False)
    sku: Mapped[str | None] = mapped_column(String(120))
    fabricante: Mapped[str | None] = mapped_column(String(120))
    observaciones: Mapped[str | None] = mapped_column(Text)
    orden: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    presupuesto = relationship("Presupuesto", back_populates="items")
    producto = relationship("Producto")
