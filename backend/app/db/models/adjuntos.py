"""Modelo: adjuntos (archivos de un mail, con descripción generada por IA)."""

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class Adjunto(Base, TimestampMixin):
    __tablename__ = "adjuntos"

    id: Mapped[int] = mapped_column(primary_key=True)
    mail_id: Mapped[int] = mapped_column(ForeignKey("mails.id"), nullable=False)
    nombre_archivo: Mapped[str] = mapped_column(String(500), nullable=False)
    mime_type: Mapped[str | None] = mapped_column(String(120))
    path_storage: Mapped[str | None] = mapped_column(String(500))
    descripcion_ia: Mapped[str | None] = mapped_column(Text)

    mail = relationship("Mail", back_populates="archivos")
