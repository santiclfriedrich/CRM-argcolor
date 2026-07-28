"""Modelo: bloc de notas personal (una fila por usuario)."""

from sqlalchemy import ForeignKey, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class NotaPersonal(Base, TimestampMixin):
    """Bloc de notas libre y privado de cada usuario. Autoguardado desde el
    front (sin botón). Una sola fila por usuario."""

    __tablename__ = "notas_personales"

    id: Mapped[int] = mapped_column(primary_key=True)
    usuario_id: Mapped[int] = mapped_column(
        ForeignKey("usuarios.id"), unique=True, index=True, nullable=False
    )
    contenido: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("''"))

    usuario = relationship("Usuario")
