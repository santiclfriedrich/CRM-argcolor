"""Modelo: mails (registro de mails entrantes y salientes vinculados a oportunidades)."""

import enum
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Enum, ForeignKey, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, query_expression, relationship

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
    oportunidad_id: Mapped[int | None] = mapped_column(
        ForeignKey("oportunidades.id"), index=True
    )
    # Dueño de la casilla de la que se sincronizó este mail (inbox del CRM). Un
    # mail comercial viejo puede no tenerlo; el sync de buzón lo completa.
    usuario_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), index=True)
    direccion: Mapped[DireccionMail] = mapped_column(
        Enum(DireccionMail, name="direccion_mail"), nullable=False
    )
    de: Mapped[str | None] = mapped_column(String(320))
    para: Mapped[str | None] = mapped_column(String(500))
    asunto: Mapped[str | None] = mapped_column(String(500))
    cuerpo: Mapped[str | None] = mapped_column(Text)
    fecha: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Estado leído/no leído (reflejo del label UNREAD de Gmail; se marca True al
    # abrirlo en el CRM). Local al CRM: no se empuja de vuelta a Gmail.
    leido: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    # Carpeta del inbox del CRM: 'entrada' | 'enviados' | 'archivo' (derivada de
    # los labels de Gmail INBOX/SENT). None en mails viejos no sincronizados.
    carpeta: Mapped[str | None] = mapped_column(String(20), index=True)
    # with_variant: JSONB en Postgres; JSON en SQLite (solo para tests).
    adjuntos: Mapped[dict | None] = mapped_column(JSONB().with_variant(JSON(), "sqlite"))
    datos_extraidos_ia: Mapped[dict | None] = mapped_column(
        JSONB().with_variant(JSON(), "sqlite")
    )

    # Computado por query (with_expression) en el listado de la bandeja: dice si
    # hay cuerpo SIN traer el texto completo (que puede ser grande). Fuera de esa
    # query queda en None y no se usa.
    tiene_cuerpo: Mapped[bool] = query_expression()

    oportunidad = relationship("Oportunidad", back_populates="mails")
    archivos = relationship("Adjunto", back_populates="mail")
    usuario = relationship("Usuario")
