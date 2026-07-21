"""Modelo: grupos de destinatarios de Compras, configurables por usuario."""

from sqlalchemy import JSON, Boolean, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class GrupoCompras(Base, TimestampMixin):
    """Un grupo de destinatarios de Compras que arma cada vendedor.

    Cada usuario tiene los suyos; puede marcar uno como `es_default` para que
    venga preseleccionado al pedir a Compras.
    """

    __tablename__ = "grupos_compras"

    id: Mapped[int] = mapped_column(primary_key=True)
    usuario_id: Mapped[int] = mapped_column(
        ForeignKey("usuarios.id"), nullable=False, index=True
    )
    nombre: Mapped[str] = mapped_column(String(120), nullable=False)
    to: Mapped[str] = mapped_column(String(255), nullable=False)  # destinatario principal
    cc: Mapped[list | None] = mapped_column(JSONB().with_variant(JSON(), "sqlite"))
    es_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    usuario = relationship("Usuario")
