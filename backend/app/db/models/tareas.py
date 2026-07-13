"""Modelo: tareas (agenda / to-do del vendedor)."""

import enum
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class PrioridadTarea(str, enum.Enum):
    alta = "alta"
    media = "media"
    baja = "baja"


class Tarea(Base, TimestampMixin):
    __tablename__ = "tareas"

    id: Mapped[int] = mapped_column(primary_key=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"), nullable=False, index=True)
    titulo: Mapped[str] = mapped_column(String(300), nullable=False)
    descripcion: Mapped[str | None] = mapped_column(Text)
    subtipo: Mapped[str | None] = mapped_column(String(50))  # llamada / email / reunion / otro
    fecha_vencimiento: Mapped[date | None] = mapped_column(Date, index=True)
    prioridad: Mapped[PrioridadTarea] = mapped_column(
        Enum(PrioridadTarea, name="prioridad_tarea"),
        default=PrioridadTarea.media,
        nullable=False,
    )
    completada: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    fecha_completada: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Recordatorio (fecha + hora). Null = sin recordatorio.
    recordatorio: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Marca para no volver a avisar el mismo recordatorio (se resetea al cambiarlo).
    recordatorio_notificado: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    # Vínculos opcionales para dar contexto a la tarea.
    oportunidad_id: Mapped[int | None] = mapped_column(ForeignKey("oportunidades.id"))
    cliente_id: Mapped[int | None] = mapped_column(ForeignKey("clientes.id"))

    usuario = relationship("Usuario")
    oportunidad = relationship("Oportunidad")
    cliente = relationship("Cliente")
