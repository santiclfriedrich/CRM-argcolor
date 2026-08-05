"""Modelo: dominios_cliente (dominios de mail asociados a una cuenta)."""

from sqlalchemy import Boolean, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class DominioCliente(Base, TimestampMixin):
    __tablename__ = "dominios_cliente"

    id: Mapped[int] = mapped_column(primary_key=True)
    cliente_id: Mapped[int] = mapped_column(ForeignKey("clientes.id"), nullable=False, index=True)
    dominio: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    es_principal_dominio: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    notas: Mapped[str | None] = mapped_column(Text)

    cliente = relationship("Cliente", back_populates="dominios")
