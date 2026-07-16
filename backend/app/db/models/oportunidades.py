"""Modelo: oportunidades (núcleo del ciclo comercial)."""

import enum
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import JSON, Date, DateTime, Enum, ForeignKey, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
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
    cerrada = "cerrada"


# Estados terminales: la gestión terminó y deja de "arrastrarse" a meses nuevos.
ESTADOS_CERRADOS: frozenset["EstadoOportunidad"] = frozenset(
    {
        EstadoOportunidad.ganada,
        EstadoOportunidad.cargada_en_gbp,
        EstadoOportunidad.facturada,
        EstadoOportunidad.perdida,
        EstadoOportunidad.cerrada,
    }
)


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
    # Cuándo pasó a un estado cerrado (para "fijarla" en ese mes). Null = abierta.
    fecha_cierre: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    fuente: Mapped[str | None] = mapped_column(String(80))  # mail / manual / etc.

    # --- Seguimiento (uso comercial diario) ---
    asunto: Mapped[str | None] = mapped_column(String(255))  # título/descripción breve
    producto: Mapped[str | None] = mapped_column(String(120))  # rubro/producto (Insumos, Tablets…)
    numero_pedido: Mapped[str | None] = mapped_column(String(60))  # "PEDIDO" (ej. 1-594059)
    observacion: Mapped[str | None] = mapped_column(Text)  # nota corta de seguimiento
    valor_estimado: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    # Fechas clave del ciclo (se autocompletan en los eventos, editables a mano):
    fecha_pedido_cliente: Mapped[date | None] = mapped_column(Date)  # cuándo pidió el cliente
    fecha_enviado_compras: Mapped[date | None] = mapped_column(Date)  # cuándo fue a Compras
    fecha_respuesta_compras: Mapped[date | None] = mapped_column(Date)  # cuándo respondió Compras
    fecha_enviado_cliente: Mapped[date | None] = mapped_column(Date)  # cuándo se cotizó al cliente
    fecha_limite: Mapped[date | None] = mapped_column(Date)  # validez / hasta cuándo seguir
    # Bitácora de seguimiento: lista de {fecha, texto, autor}.
    comentarios: Mapped[list | None] = mapped_column(JSONB().with_variant(JSON(), "sqlite"))

    cliente = relationship("Cliente", back_populates="oportunidades")
    contacto = relationship("ContactoCliente")
    vendedor = relationship("Usuario", back_populates="oportunidades")
    solicitudes_compras = relationship("SolicitudCompras", back_populates="oportunidad")
    presupuestos = relationship("Presupuesto", back_populates="oportunidad")
    mails = relationship("Mail", back_populates="oportunidad")
    recordatorios = relationship("Recordatorio", back_populates="oportunidad")
