"""Modelo: mails programados (redactados para enviarse a una fecha/hora futura)."""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class MailProgramado(Base, TimestampMixin):
    __tablename__ = "mails_programados"

    id: Mapped[int] = mapped_column(primary_key=True)
    usuario_id: Mapped[int] = mapped_column(
        ForeignKey("usuarios.id"), nullable=False, index=True
    )
    para: Mapped[str] = mapped_column(String(500), nullable=False)
    asunto: Mapped[str | None] = mapped_column(String(500))
    cuerpo: Mapped[str] = mapped_column(Text, nullable=False)
    programado_para: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    enviado: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)
    fecha_envio: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error: Mapped[str | None] = mapped_column(Text)

    usuario = relationship("Usuario")
