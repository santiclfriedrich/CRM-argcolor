"""Modelo: configuracion (clave/valor JSONB para parámetros del sistema)."""

from sqlalchemy import JSON, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class Configuracion(Base, TimestampMixin):
    __tablename__ = "configuracion"

    # Ejs de clave: ccs_default_solicitudes_compras, dias_alerta_sin_respuesta,
    # plantilla_acuse_recibo, plantilla_followup_cliente
    clave: Mapped[str] = mapped_column(String(120), primary_key=True)
    # with_variant: JSONB en Postgres; JSON en SQLite (solo para tests).
    valor: Mapped[dict | None] = mapped_column(JSONB().with_variant(JSON(), "sqlite"))
