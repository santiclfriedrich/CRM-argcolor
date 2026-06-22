"""Modelo: configuracion (clave/valor JSONB para parámetros del sistema)."""

from sqlalchemy import String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class Configuracion(Base, TimestampMixin):
    __tablename__ = "configuracion"

    # Ejs de clave: ccs_default_solicitudes_compras, dias_alerta_sin_respuesta,
    # plantilla_acuse_recibo, plantilla_followup_cliente
    clave: Mapped[str] = mapped_column(String(120), primary_key=True)
    valor: Mapped[dict | None] = mapped_column(JSONB)
