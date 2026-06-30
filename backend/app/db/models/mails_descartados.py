"""Modelo: mails_descartados (registro mínimo de mails no comerciales).

La IA clasifica cada mail entrante; los que NO son consulta comercial (órdenes
de compra, facturación, newsletters, etc.) no se guardan como `mails` ni generan
oportunidad. Acá registramos solo lo mínimo para no reprocesarlos en cada ciclo
del poller y para poder auditar qué descartó la IA.
"""

from datetime import datetime

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class MailDescartado(Base, TimestampMixin):
    __tablename__ = "mails_descartados"

    id: Mapped[int] = mapped_column(primary_key=True)
    gmail_message_id: Mapped[str | None] = mapped_column(String(255), unique=True, index=True)
    categoria: Mapped[str] = mapped_column(String(50), nullable=False)
    de: Mapped[str | None] = mapped_column(String(320))
    asunto: Mapped[str | None] = mapped_column(String(500))
    fecha: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
