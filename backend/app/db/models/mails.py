"""Modelo: mails (registro de mails entrantes y salientes vinculados a oportunidades)."""

import enum
from datetime import datetime

from sqlalchemy import JSON, DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class DireccionMail(str, enum.Enum):
    entrante = "entrante"
    saliente = "saliente"


class Mail(Base, TimestampMixin):
    __tablename__ = "mails"

    id: Mapped[int] = mapped_column(primary_key=True)
    gmail_thread_id: Mapped[str | None] = mapped_column(String(255), index=True)
    gmail_message_id: Mapped[str | None] = mapped_column(String(255), unique=True, index=True)
    # Message-ID del header RFC 2822 (ej. "<CAF...@mail.gmail.com>"): sirve para
    # encadenar la respuesta (In-Reply-To/References) aunque salga de otra casilla.
    rfc_message_id: Mapped[str | None] = mapped_column(String(512))
    oportunidad_id: Mapped[int | None] = mapped_column(ForeignKey("oportunidades.id"))
    direccion: Mapped[DireccionMail] = mapped_column(
        Enum(DireccionMail, name="direccion_mail"), nullable=False
    )
    de: Mapped[str | None] = mapped_column(String(320))
    para: Mapped[str | None] = mapped_column(String(500))
    asunto: Mapped[str | None] = mapped_column(String(500))
    cuerpo: Mapped[str | None] = mapped_column(Text)
    fecha: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # with_variant: JSONB en Postgres; JSON en SQLite (solo para tests).
    adjuntos: Mapped[dict | None] = mapped_column(JSONB().with_variant(JSON(), "sqlite"))
    datos_extraidos_ia: Mapped[dict | None] = mapped_column(
        JSONB().with_variant(JSON(), "sqlite")
    )

    oportunidad = relationship("Oportunidad", back_populates="mails")
    archivos = relationship("Adjunto", back_populates="mail")
