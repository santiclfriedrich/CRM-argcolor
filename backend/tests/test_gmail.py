"""Tests del parsing de Gmail y del poller (con fakes, sin tocar la API)."""

import base64
from collections.abc import Iterator
from typing import Any

import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.db.models.clientes import Cliente
from app.db.models.contactos_cliente import ContactoCliente
from app.db.models.dominios_cliente import DominioCliente
from app.db.models.mails import Mail
from app.db.models.oportunidades import Oportunidad
from app.db.models.usuarios import Usuario
from app.integrations.ai.base import AIProvider, EmailData
from app.integrations.gmail.client import parse_gmail_message
from app.services.gmail_poller import poll_once

engine = create_engine(
    "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
)
TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def _b64(text: str) -> str:
    return base64.urlsafe_b64encode(text.encode()).decode()


class FakeAI(AIProvider):
    def extract_email_data(self, email_text, image_paths=None) -> EmailData:  # noqa: ANN001
        return EmailData(producto="Pigmento", requerimiento=email_text[:30])

    def draft_quote(self, compras_response):  # noqa: ANN001
        raise NotImplementedError

    def summarize_thread(self, messages):  # noqa: ANN001
        return ""


class FakeGmail:
    def __init__(self, messages: dict[str, dict[str, Any]]) -> None:
        self._messages = messages

    def list_message_ids(self, query: str, max_results: int = 25) -> list[str]:
        return list(self._messages)

    def get_message(self, message_id: str) -> dict[str, Any]:
        return self._messages[message_id]


def test_parse_gmail_message_multipart() -> None:
    raw = {
        "id": "m1",
        "threadId": "t1",
        "internalDate": "1700000000000",
        "snippet": "resumen",
        "payload": {
            "mimeType": "multipart/alternative",
            "headers": [
                {"name": "From", "value": "Juan Perez <juan@bencen.com.ar>"},
                {"name": "Subject", "value": "Pedido de pigmento"},
                {"name": "To", "value": "ventas@argentinacolor.com"},
            ],
            "parts": [{"mimeType": "text/plain", "body": {"data": _b64("Necesito 100kg")}}],
        },
    }
    parsed = parse_gmail_message(raw)
    assert parsed["message_id"] == "m1"
    assert parsed["de"] == "juan@bencen.com.ar"  # se extrae el email del "From"
    assert parsed["asunto"] == "Pedido de pigmento"
    assert "100kg" in parsed["cuerpo"]
    assert parsed["fecha"] is not None


@pytest.fixture()
def db() -> Iterator[Session]:
    Base.metadata.create_all(
        bind=engine,
        tables=[
            Usuario.__table__,
            Cliente.__table__,
            ContactoCliente.__table__,
            DominioCliente.__table__,
            Oportunidad.__table__,
            Mail.__table__,
        ],
    )
    session = TestingSessionLocal()
    session.add(Cliente(id=1, razon_social="BENCEN S.A.", activo=True))
    session.add(DominioCliente(id=1, cliente_id=1, dominio="bencen.com.ar"))
    session.commit()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


def _msg(mid: str) -> dict[str, Any]:
    return {
        "message_id": mid,
        "thread_id": f"t-{mid}",
        "de": "juan@bencen.com.ar",
        "para": "ventas@argentinacolor.com",
        "asunto": "Pedido",
        "cuerpo": "Necesito 100kg de pigmento rojo",
        "fecha": None,
    }


def test_poll_procesa_nuevos_y_dedup(db: Session) -> None:
    gmail = FakeGmail({"m1": _msg("m1"), "m2": _msg("m2")})
    ai = FakeAI()

    # Primera corrida: procesa los 2 mails nuevos.
    assert poll_once(db, ai, gmail, query="x") == 2
    assert db.scalar(select(func.count()).select_from(Mail)) == 2
    # Identificó el cliente por dominio.
    op = db.scalars(select(Oportunidad)).first()
    assert op is not None and op.cliente_id == 1 and op.fuente == "mail"

    # Segunda corrida con los mismos ids: dedup -> no reprocesa.
    assert poll_once(db, ai, gmail, query="x") == 0
    assert db.scalar(select(func.count()).select_from(Mail)) == 2
