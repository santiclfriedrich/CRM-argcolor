"""Tests del parsing de Gmail y del poller (con fakes, sin tocar la API)."""

import base64
from collections.abc import Iterator
from typing import Any

import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.db.models.adjuntos import Adjunto
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
    def __init__(self) -> None:
        self.images_recibidas: list = []

    def extract_email_data(self, email_text, images=None) -> EmailData:  # noqa: ANN001
        self.images_recibidas = images or []
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
            Adjunto.__table__,
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


def test_default_vendedor_id_cuando_cliente_no_tiene_vendedor(db: Session) -> None:
    # El cliente BENCEN (seed) no tiene vendedor asignado; debe heredar el de la casilla.
    db.add(Usuario(id=7, email="vendedor7@argentinacolor.com", nombre="Siete", activo=True))
    db.commit()
    gmail = FakeGmail({"x1": _msg("x1")})
    assert poll_once(db, FakeAI(), gmail, query="q", default_vendedor_id=7) == 1
    op = db.scalars(select(Oportunidad)).first()
    assert op is not None and op.cliente_id == 1 and op.vendedor_id == 7


def test_parse_extrae_adjunto_de_imagen() -> None:
    raw = {
        "id": "m9",
        "payload": {
            "mimeType": "multipart/mixed",
            "headers": [{"name": "From", "value": "juan@bencen.com.ar"}],
            "parts": [
                {"mimeType": "text/plain", "body": {"data": _b64("Mirá la foto")}},
                {
                    "mimeType": "image/jpeg",
                    "filename": "toner.jpg",
                    "body": {"attachmentId": "att-1"},
                },
            ],
        },
    }
    att = parse_gmail_message(raw)["attachments"]
    assert len(att) == 1
    assert att[0]["nombre"] == "toner.jpg"
    assert att[0]["mime"] == "image/jpeg"
    assert att[0]["attachment_id"] == "att-1"


def test_flujo_multimodal_pasa_imagen_a_ia_y_guarda_adjunto(
    db: Session, tmp_path, monkeypatch
) -> None:  # noqa: ANN001
    from app.config import settings
    from app.db.models.adjuntos import Adjunto as AdjuntoModel
    from app.services.ingest import process_incoming_email

    monkeypatch.setattr(settings, "MEDIA_DIR", str(tmp_path))
    ai = FakeAI()

    mail = process_incoming_email(
        db,
        ai,
        de="juan@bencen.com.ar",
        asunto="Pedido con foto",
        cuerpo="Necesito esto",
        images=[{"nombre": "toner.jpg", "mime": "image/jpeg", "data": b"\xff\xd8\xff\x00datos"}],
    )

    # La IA recibió la imagen.
    assert len(ai.images_recibidas) == 1
    assert ai.images_recibidas[0].mime_type == "image/jpeg"

    # Se guardó el adjunto (fila + archivo en disco).
    adj = db.scalars(select(AdjuntoModel).where(AdjuntoModel.mail_id == mail.id)).first()
    assert adj is not None and adj.nombre_archivo == "toner.jpg"
    from pathlib import Path

    assert Path(adj.path_storage).exists()
