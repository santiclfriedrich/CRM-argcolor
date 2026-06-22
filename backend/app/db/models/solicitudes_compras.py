"""Modelo: solicitudes_compras (reemplazo del Google Form interno a Compras)."""

import enum
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import ARRAY, Date, DateTime, Enum, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class CondicionPago(str, enum.Enum):
    dias_15 = "15"
    dias_30 = "30"
    dias_45 = "45"
    dias_60 = "60"
    dias_120 = "120"
    transferencia = "Transferencia"


class EstadoSolicitud(str, enum.Enum):
    enviada = "enviada"
    respondida = "respondida"
    cerrada = "cerrada"


class SolicitudCompras(Base, TimestampMixin):
    __tablename__ = "solicitudes_compras"

    id: Mapped[int] = mapped_column(primary_key=True)
    oportunidad_id: Mapped[int] = mapped_column(ForeignKey("oportunidades.id"), nullable=False)
    solicitante_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"), nullable=False)
    requerimiento: Mapped[str] = mapped_column(Text, nullable=False)
    archivos_adjuntos: Mapped[dict | None] = mapped_column(JSONB)
    condicion_pago: Mapped[CondicionPago | None] = mapped_column(
        Enum(CondicionPago, name="condicion_pago")
    )
    importe_aproximado: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    fecha_limite: Mapped[date | None] = mapped_column(Date)
    presupuesto_gbp_referencia: Mapped[str | None] = mapped_column(String(80))
    ccs_extra: Mapped[list[str] | None] = mapped_column(ARRAY(String))
    fecha_envio: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    fecha_respuesta: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    gmail_thread_id: Mapped[str | None] = mapped_column(String(255), index=True)
    estado: Mapped[EstadoSolicitud] = mapped_column(
        Enum(EstadoSolicitud, name="estado_solicitud"),
        default=EstadoSolicitud.enviada,
        nullable=False,
    )

    oportunidad = relationship("Oportunidad", back_populates="solicitudes_compras")
    solicitante = relationship("Usuario")
    respuestas = relationship("RespuestaCompras", back_populates="solicitud")
