"""Modelo: respuestas_compras (respuesta de Carlos Sayegh parseada por IA)."""

from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class RespuestaCompras(Base, TimestampMixin):
    __tablename__ = "respuestas_compras"

    id: Mapped[int] = mapped_column(primary_key=True)
    solicitud_compras_id: Mapped[int] = mapped_column(
        ForeignKey("solicitudes_compras.id"), nullable=False
    )
    fecha_recepcion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    contenido_raw: Mapped[str | None] = mapped_column(Text)
    # items: fabricante/sku/descripcion/cantidad/precio_unit/iva/obs
    # with_variant: JSONB en Postgres; JSON en SQLite (solo para tests).
    datos_parseados_ia: Mapped[dict | None] = mapped_column(JSONB().with_variant(JSON(), "sqlite"))
    notas_compras: Mapped[str | None] = mapped_column(Text)

    solicitud = relationship("SolicitudCompras", back_populates="respuestas")
