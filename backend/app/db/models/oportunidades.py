"""Modelo: oportunidades (núcleo del ciclo comercial)."""

import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class EstadoOportunidad(str, enum.Enum):
    nueva = "nueva"
    requiere_aclaracion = "requiere_aclaracion"
    en_compras = "en_compras"
    presupuestada = "presupuestada"
    ganada = "ganada"
    cargada_en_gbp = "cargada_en_gbp"
    facturada = "facturada"
    perdida = "perdida"


class Oportunidad(Base, TimestampMixin):
    __tablename__ = "oportunidades"

    id: Mapped[int] = mapped_column(primary_key=True)
    cliente_id: Mapped[int | None] = mapped_column(ForeignKey("clientes.id"))
    contacto_cliente_id: Mapped[int | None] = mapped_column(ForeignKey("contactos_cliente.id"))
    vendedor_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"))
    estado: Mapped[EstadoOportunidad] = mapped_column(
        Enum(EstadoOportunidad, name="estado_oportunidad"),
        default=EstadoOportunidad.nueva,
        nullable=False,
        index=True,
    )
    fecha_creacion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    fecha_ultimo_movimiento: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    fuente: Mapped[str | None] = mapped_column(String(80))  # mail / manual / etc.

    cliente = relationship("Cliente", back_populates="oportunidades")
    contacto = relationship("ContactoCliente")
    vendedor = relationship("Usuario", back_populates="oportunidades")
    solicitudes_compras = relationship("SolicitudCompras", back_populates="oportunidad")
    presupuestos = relationship("Presupuesto", back_populates="oportunidad")
    mails = relationship("Mail", back_populates="oportunidad")
    recordatorios = relationship("Recordatorio", back_populates="oportunidad")
