"""Modelo: bloc de notas personal (una fila por usuario)."""

from sqlalchemy import ForeignKey, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class NotaPersonal(Base, TimestampMixin):
    """Una nota libre y privada de un usuario (estilo bloc de notas / Apple
    Notes). Autoguardado desde el front (sin botón). Cada usuario puede tener
    varias; el título se deriva de la primera línea del contenido."""

    __tablename__ = "notas_personales"

    id: Mapped[int] = mapped_column(primary_key=True)
    usuario_id: Mapped[int] = mapped_column(
        ForeignKey("usuarios.id"), index=True, nullable=False
    )
    contenido: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("''"))

    usuario = relationship("Usuario")
