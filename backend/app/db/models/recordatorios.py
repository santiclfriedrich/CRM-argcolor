"""Modelo: recordatorios (manuales y automáticos, con contexto generado por IA)."""

import enum
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class TipoRecordatorio(str, enum.Enum):
    manual = "manual"
    automatico_estado = "automatico_estado"
    automatico_inactividad = "automatico_inactividad"


class Recordatorio(Base, TimestampMixin):
    __tablename__ = "recordatorios"

    id: Mapped[int] = mapped_column(primary_key=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"), nullable=False)
    oportunidad_id: Mapped[int | None] = mapped_column(ForeignKey("oportunidades.id"))
    mensaje: Mapped[str] = mapped_column(Text, nullable=False)
    fecha_recordatorio: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    completado: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    tipo: Mapped[TipoRecordatorio] = mapped_column(
        Enum(TipoRecordatorio, name="tipo_recordatorio"),
        default=TipoRecordatorio.manual,
        nullable=False,
    )

    usuario = relationship("Usuario")
    oportunidad = relationship("Oportunidad", back_populates="recordatorios")
