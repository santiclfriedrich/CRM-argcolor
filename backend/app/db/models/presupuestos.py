"""Modelo: presupuestos (cotizaciones armadas dentro del CRM)."""

import enum
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, Enum, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class EstadoPresupuesto(str, enum.Enum):
    borrador = "borrador"
    enviado = "enviado"
    aceptado = "aceptado"
    rechazado = "rechazado"
    negociando = "negociando"


class EstadoCargaGbp(str, enum.Enum):
    """Ciclo de la carga del presupuesto en GBP por el bot (worker Playwright).
    `None` en la columna = nunca se mandó a GBP."""

    pendiente = "pendiente"  # encolado; el bot lo puede tomar
    en_proceso = "en_proceso"  # el bot lo está cargando
    cargado = "cargado"  # ok: con numero (id_gbp_pedido) + PDF de GBP
    error = "error"  # falló sin guardar: con gbp_error
    prueba = "prueba"  # DRY-RUN del bot: anduvo pero NO guardó en GBP
    revisar = "revisar"  # puede haber quedado GUARDADO en GBP: verificar antes de reencolar


# "Entregar por" que ofrece GBP (elegible en el CRM).
ENTREGA_OPCIONES = ("Retiro TML - Garin", "TML Corpo")
# IVA válidos (el dropdown de GBP solo tiene estos dos). Para ítems manuales.
IVA_OPCIONES = (Decimal("21"), Decimal("10.5"))


class Presupuesto(Base, TimestampMixin):
    __tablename__ = "presupuestos"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Opcional: un presupuesto puede ser standalone (solo con N° de cliente) o
    # colgar de una oportunidad (flujo desde Solicitudes a Compras).
    oportunidad_id: Mapped[int | None] = mapped_column(
        ForeignKey("oportunidades.id"), index=True
    )
    # Cliente directo (para el standalone, donde no hay oportunidad). Cuando hay
    # oportunidad, se completa con su cliente para unificar el render del PDF.
    cliente_id: Mapped[int | None] = mapped_column(ForeignKey("clientes.id"), index=True)
    # N° de cliente de GBP (lo que el bot tipea). Snapshot/entrada manual.
    cliente_numero: Mapped[str | None] = mapped_column(String(40), index=True)
    codigo: Mapped[str] = mapped_column(String(20), unique=True, index=True, nullable=False)
    monto_total: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    moneda: Mapped[str] = mapped_column(String(3), default="USD", nullable=False)
    # Documento a emitir en GBP ("Presupuesto USD" | "Presupuesto ARS").
    documento: Mapped[str] = mapped_column(String(40), default="Presupuesto USD", nullable=False)
    # Sucursal de GBP (1 = 01.ARG. COLOR). El bot la usa al crear el pedido.
    sucursal: Mapped[str] = mapped_column(String(10), default="1", nullable=False)
    condicion_pago: Mapped[str | None] = mapped_column(String(40))
    plazo_entrega: Mapped[str | None] = mapped_column(String(120))
    validez: Mapped[str | None] = mapped_column(String(120))
    pdf_url: Mapped[str | None] = mapped_column(String(500))
    qr_url: Mapped[str | None] = mapped_column(String(500))
    fecha_envio: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    fecha_respuesta_cliente: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    estado: Mapped[EstadoPresupuesto] = mapped_column(
        Enum(EstadoPresupuesto, name="estado_presupuesto"),
        default=EstadoPresupuesto.borrador,
        nullable=False,
        index=True,
    )
    id_gbp_pedido: Mapped[str | None] = mapped_column(String(80), index=True)
    id_gbp_factura: Mapped[str | None] = mapped_column(String(80), index=True)
    fecha_validez: Mapped[date | None] = mapped_column(Date)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    # --- Carga a GBP por el bot (worker Playwright self-hosted) ---
    # Forma de entrega elegida ("Retiro TML - Garin" | "TML Corpo").
    entrega_por: Mapped[str | None] = mapped_column(String(40))
    # Ciclo de carga (texto, sin enum nativo). None = nunca se mandó a GBP.
    estado_carga: Mapped[str | None] = mapped_column(String(20), index=True)
    # PDF oficial que genera GBP (key en storage/R2). El de GBP es el oficial.
    pdf_gbp_key: Mapped[str | None] = mapped_column(String(500))
    gbp_error: Mapped[str | None] = mapped_column(Text)
    gbp_intentos: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    gbp_tomado_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    gbp_cargado_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Lote: un presupuesto con muchos ítems se parte en N "partes" (cada una = un
    # pedido de GBP). Las partes comparten `gbp_grupo` y se numeran con `gbp_parte`.
    gbp_grupo: Mapped[str | None] = mapped_column(String(40), index=True)
    gbp_parte: Mapped[int | None] = mapped_column(Integer)

    # Auditoría: quién lo creó y quién lo editó por última vez.
    creado_por_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"))
    editado_por_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"))
    editado_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    oportunidad = relationship("Oportunidad", back_populates="presupuestos")
    cliente = relationship("Cliente", foreign_keys=[cliente_id])
    creado_por = relationship("Usuario", foreign_keys=[creado_por_id])
    editado_por = relationship("Usuario", foreign_keys=[editado_por_id])
    items = relationship(
        "PresupuestoItem", back_populates="presupuesto", order_by="PresupuestoItem.orden"
    )
