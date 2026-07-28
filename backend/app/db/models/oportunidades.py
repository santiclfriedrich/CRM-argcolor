"""Modelo: oportunidades (núcleo del ciclo comercial)."""

import enum
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Numeric,
    String,
    Text,
    false,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class EstadoOportunidad(str, enum.Enum):
    nueva = "nueva"
    requiere_aclaracion = "requiere_aclaracion"
    en_compras = "en_compras"  # etiqueta UI: "Enviado a compras"
    cotizado_compras = "cotizado_compras"  # Compras respondió con la cotización
    presupuestada = "presupuestada"  # etiqueta UI: "Enviada al cliente"
    confirmada = "confirmada"  # el cliente confirmó; pago pendiente
    ganada = "ganada"  # etiqueta UI: "Pago"
    perdida = "perdida"  # etiqueta UI: "No avanzó"


# Estados terminales: la gestión terminó y deja de "arrastrarse" a meses nuevos.
# "Confirmada" NO es terminal (falta el pago), así que se sigue arrastrando.
ESTADOS_CERRADOS: frozenset["EstadoOportunidad"] = frozenset(
    {
        EstadoOportunidad.ganada,
        EstadoOportunidad.perdida,
    }
)

# Estados previos a que Compras cotice: al recibir la respuesta de Compras la
# oportunidad avanza a "cotizado_compras" (sin pisar estados posteriores).
_PREVIOS_A_COTIZAR: frozenset["EstadoOportunidad"] = frozenset(
    {
        EstadoOportunidad.nueva,
        EstadoOportunidad.requiere_aclaracion,
        EstadoOportunidad.en_compras,
    }
)


class Oportunidad(Base, TimestampMixin):
    __tablename__ = "oportunidades"

    id: Mapped[int] = mapped_column(primary_key=True)
    cliente_id: Mapped[int | None] = mapped_column(ForeignKey("clientes.id"))
    contacto_cliente_id: Mapped[int | None] = mapped_column(ForeignKey("contactos_cliente.id"))
    vendedor_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"))
    # Quién creó la oportunidad (registro): manual = quien la carga; mail = dueño
    # de la casilla. No cambia aunque se reasigne el vendedor.
    creado_por_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"))
    # Transferencia pendiente: destinatario propuesto que todavía no aceptó. El
    # vendedor_id NO cambia hasta que acepta; mientras tanto sale de las "Mías"
    # de ambos y aparece como pendiente para el destinatario. Al rechazar, se
    # limpia (vuelve al vendedor). Al aceptar, vendedor_id = este id y se limpia.
    transferencia_para_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"))
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
    # Requerimiento leído por la IA del mail original (producto/cantidad/detalle/
    # plazo). Editable a mano. En oportunidades manuales arranca vacío.
    requerimiento: Mapped[str | None] = mapped_column(Text)
    producto: Mapped[str | None] = mapped_column(String(120))  # rubro/producto (Insumos, Tablets…)
    numero_pedido: Mapped[str | None] = mapped_column(String(60))  # "PEDIDO" (ej. 1-594059)
    ing: Mapped[str | None] = mapped_column(String(10))  # iniciales del "Ing." asignado (ej. C.S)
    observacion: Mapped[str | None] = mapped_column(Text)  # nota corta de seguimiento
    # Se cargó el pedido en GBP (ex-estado, ahora un flag marcable a mano).
    cargada_en_gbp: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=false())
    valor_estimado: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    # Fechas clave del ciclo (se autocompletan en los eventos, editables a mano):
    fecha_pedido_cliente: Mapped[date | None] = mapped_column(Date)  # cuándo pidió el cliente
    fecha_enviado_compras: Mapped[date | None] = mapped_column(Date)  # cuándo fue a Compras
    fecha_respuesta_compras: Mapped[date | None] = mapped_column(Date)  # cuándo respondió Compras
    fecha_enviado_cliente: Mapped[date | None] = mapped_column(Date)  # cuándo se cotizó al cliente
    fecha_limite: Mapped[date | None] = mapped_column(Date)  # validez / hasta cuándo seguir
    # Bitácora de seguimiento: lista de {fecha, texto, autor}.
    comentarios: Mapped[list | None] = mapped_column(JSONB().with_variant(JSON(), "sqlite"))
    # Adjuntos de la oportunidad: lista de {id, filename, mime_type, path}.
    archivos_adjuntos: Mapped[list | None] = mapped_column(JSONB().with_variant(JSON(), "sqlite"))

    cliente = relationship("Cliente", back_populates="oportunidades")
    contacto = relationship("ContactoCliente")
    vendedor = relationship(
        "Usuario", foreign_keys=[vendedor_id], back_populates="oportunidades"
    )
    creado_por = relationship("Usuario", foreign_keys=[creado_por_id])
    transferencia_para = relationship("Usuario", foreign_keys=[transferencia_para_id])
    solicitudes_compras = relationship("SolicitudCompras", back_populates="oportunidad")
    presupuestos = relationship("Presupuesto", back_populates="oportunidad")
    mails = relationship("Mail", back_populates="oportunidad")
    recordatorios = relationship("Recordatorio", back_populates="oportunidad")
