"""Modelo: solicitudes_compras (reemplazo del Google Form interno a Compras)."""

import enum
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import ARRAY, JSON, Date, DateTime, Enum, ForeignKey, Numeric, String, Text
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
    cheque_ant_15 = "Cheque Anticipado a Entrega - 15 días"
    cheque_ant_30 = "Cheque Anticipado a Entrega - 30 días"
    cheque_ant_60 = "Cheque Anticipado a Entrega - 60 días"


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
    numero_cliente: Mapped[str | None] = mapped_column(String(80))
    # Lista de adjuntos enviados a Compras: [{filename, mime_type, path}].
    # with_variant: JSONB/ARRAY en Postgres; JSON en SQLite (solo para tests).
    archivos_adjuntos: Mapped[list | None] = mapped_column(JSONB().with_variant(JSON(), "sqlite"))
    condicion_pago: Mapped[CondicionPago | None] = mapped_column(
        Enum(CondicionPago, name="condicion_pago")
    )
    importe_aproximado: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    fecha_limite: Mapped[date | None] = mapped_column(Date)
    presupuesto_gbp_referencia: Mapped[str | None] = mapped_column(String(80))
    ccs_extra: Mapped[list[str] | None] = mapped_column(
        ARRAY(String).with_variant(JSON(), "sqlite")
    )
    # Snapshot del destino elegido al enviar (grupo de Compras del vendedor).
    # Si quedan en null se usa el destinatario global (compatibilidad).
    destino_to: Mapped[str | None] = mapped_column(String(255))
    destino_cc: Mapped[list | None] = mapped_column(JSONB().with_variant(JSON(), "sqlite"))
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
