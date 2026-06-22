"""Modelo: clientes (cuentas)."""

from sqlalchemy import Boolean, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class Cliente(Base, TimestampMixin):
    __tablename__ = "clientes"

    id: Mapped[int] = mapped_column(primary_key=True)
    razon_social: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    cuit: Mapped[str | None] = mapped_column(String(20), index=True)
    vendedor_asignado_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"))
    notas: Mapped[str | None] = mapped_column(Text)
    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    vendedor_asignado = relationship("Usuario", back_populates="clientes")
    contactos = relationship("ContactoCliente", back_populates="cliente")
    dominios = relationship("DominioCliente", back_populates="cliente")
    oportunidades = relationship("Oportunidad", back_populates="cliente")
