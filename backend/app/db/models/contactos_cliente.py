"""Modelo: contactos_cliente (personas dentro de una cuenta)."""

import enum

from sqlalchemy import Boolean, Enum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class RolCompra(str, enum.Enum):
    decisor = "decisor"
    tecnico = "tecnico"
    compras = "compras"
    logistica = "logistica"
    otro = "otro"


class ContactoCliente(Base, TimestampMixin):
    __tablename__ = "contactos_cliente"

    id: Mapped[int] = mapped_column(primary_key=True)
    cliente_id: Mapped[int] = mapped_column(ForeignKey("clientes.id"), nullable=False)
    nombre: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), index=True)
    telefono: Mapped[str | None] = mapped_column(String(50))
    cargo: Mapped[str | None] = mapped_column(String(120))
    rol_compra: Mapped[RolCompra] = mapped_column(
        Enum(RolCompra, name="rol_compra"), default=RolCompra.otro, nullable=False
    )
    es_principal: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    notas: Mapped[str | None] = mapped_column(Text)

    cliente = relationship("Cliente", back_populates="contactos")
