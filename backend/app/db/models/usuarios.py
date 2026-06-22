"""Modelo: usuarios (vendedores, admin, compras)."""

import enum

from sqlalchemy import Boolean, Enum, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class RolUsuario(str, enum.Enum):
    vendedor = "vendedor"
    admin = "admin"
    compras = "compras"


class Usuario(Base, TimestampMixin):
    __tablename__ = "usuarios"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    nombre: Mapped[str] = mapped_column(String(255), nullable=False)
    rol: Mapped[RolUsuario] = mapped_column(
        Enum(RolUsuario, name="rol_usuario"), default=RolUsuario.vendedor, nullable=False
    )
    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    clientes = relationship("Cliente", back_populates="vendedor_asignado")
    oportunidades = relationship("Oportunidad", back_populates="vendedor")
