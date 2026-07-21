"""Modelo: usuarios (vendedores, admin, compras)."""

import enum
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, String, Text
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

    # Gmail propio del vendedor (OAuth): refresh token CIFRADO + cuándo se conectó.
    # Permite que el poller lea la casilla de cada uno (ver app.core.crypto).
    gmail_refresh_token: Mapped[str | None] = mapped_column(Text)
    gmail_conectado_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    clientes = relationship(
        "Cliente",
        back_populates="vendedor_asignado",
        foreign_keys="Cliente.vendedor_asignado_id",
    )
    oportunidades = relationship("Oportunidad", back_populates="vendedor")

    @property
    def gmail_conectado(self) -> bool:
        return self.gmail_refresh_token is not None
