"""Modelo: productos (catálogo importado de GBP)."""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class Producto(Base, TimestampMixin):
    __tablename__ = "productos"

    id: Mapped[int] = mapped_column(primary_key=True)
    codigo: Mapped[str] = mapped_column(String(80), unique=True, index=True, nullable=False)
    descripcion: Mapped[str] = mapped_column(String(500), nullable=False)
    unidad: Mapped[str | None] = mapped_column(String(40))
    precio_base: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    moneda: Mapped[str] = mapped_column(String(3), default="USD", nullable=False)
    categoria: Mapped[str | None] = mapped_column(String(120), index=True)
    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    ultima_actualizacion: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
