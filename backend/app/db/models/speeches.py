"""Modelo: speeches (plantillas de texto para el requerimiento a Compras).

Cada usuario arma los suyos (título + texto). En el formulario de Solicitud a
Compras se puede elegir uno para llenar el requerimiento.
"""

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class Speech(Base, TimestampMixin):
    __tablename__ = "speeches"

    id: Mapped[int] = mapped_column(primary_key=True)
    usuario_id: Mapped[int] = mapped_column(
        ForeignKey("usuarios.id"), nullable=False, index=True
    )
    titulo: Mapped[str] = mapped_column(String(120), nullable=False)
    texto: Mapped[str] = mapped_column(Text, nullable=False)

    usuario = relationship("Usuario")
