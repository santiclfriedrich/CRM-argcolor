"""Tests del sync de buzón completo a la bandeja (inbox del CRM), sin red ni IA."""

from collections.abc import Iterator
from typing import Any

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.db.models.mails import DireccionMail, Mail
from app.db.models.mails_descartados import MailDescartado
from app.db.models.usuarios import Usuario
from app.services.gmail_inbox import dias_ventana, sync_inbox_for_user

engine = create_engine(
    "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
)
TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

_TABLES = [Usuario.__table__, Mail.__table__, MailDescartado.__table__]


@pytest.fixture()
def db() -> Iterator[Session]:
    Base.metadata.create_all(bind=engine, tables=_TABLES)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine, tables=_TABLES)


class FakeGmail:
    """Gmail falso: devuelve ids fijos y un mensaje por id (con sus labels)."""

    def __init__(self, mensajes: dict[str, dict[str, Any]]) -> None:
        self.mensajes = mensajes

    def list_message_ids(self, query: str, max_results: int = 25) -> list[str]:
        return list(self.mensajes.keys())

    def get_message(self, message_id: str, with_attachments: bool = True) -> dict[str, Any]:
        return self.mensajes[message_id]


def _msg(mid: str, *, labels: list[str], de: str, asunto: str) -> dict[str, Any]:
    return {
        "message_id": mid,
        "thread_id": f"t-{mid}",
        "labels": labels,
        "rfc_message_id": f"<{mid}@mail>",
        "de": de,
        "para": "ventas@argentinacolor.com",
        "asunto": asunto,
        "cuerpo": f"cuerpo {mid}",
        "fecha": None,
    }


@pytest.fixture()
def usuario(db: Session) -> Usuario:
    u = Usuario(email="vendedor@argentinacolor.com", nombre="Vendedor")
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def test_sync_trae_todo_con_carpeta_y_leido(db: Session, usuario: Usuario) -> None:
    gmail = FakeGmail(
        {
            "m1": _msg("m1", labels=["INBOX", "UNREAD"], de="cliente@x.com", asunto="Consulta"),
            "m2": _msg("m2", labels=["INBOX"], de="otro@y.com", asunto="Leído"),
            "m3": _msg("m3", labels=["SENT"], de="vendedor@argentinacolor.com", asunto="Enviado"),
            "m4": _msg("m4", labels=["IMPORTANT"], de="viejo@z.com", asunto="Archivado"),
        }
    )
    r = sync_inbox_for_user(db, gmail, usuario)
    assert r["nuevos"] == 4
    assert r["errores"] == 0

    por_id = {m.gmail_message_id: m for m in db.scalars(select(Mail))}
    # Entrada, no leído.
    assert por_id["m1"].carpeta == "entrada"
    assert por_id["m1"].leido is False
    assert por_id["m1"].direccion == DireccionMail.entrante
    assert por_id["m1"].usuario_id == usuario.id
    # Entrada, leído (sin UNREAD).
    assert por_id["m2"].carpeta == "entrada"
    assert por_id["m2"].leido is True
    # Enviado -> carpeta enviados + dirección saliente.
    assert por_id["m3"].carpeta == "enviados"
    assert por_id["m3"].direccion == DireccionMail.saliente
    # Ni INBOX ni SENT -> archivo (solo lectura).
    assert por_id["m4"].carpeta == "archivo"


def test_sync_es_idempotente_y_refresca_estado(db: Session, usuario: Usuario) -> None:
    gmail = FakeGmail(
        {"m1": _msg("m1", labels=["INBOX", "UNREAD"], de="cliente@x.com", asunto="Hola")}
    )
    sync_inbox_for_user(db, gmail, usuario)
    # Segunda corrida: el mismo mail ahora está leído -> no duplica, refresca.
    gmail.mensajes["m1"]["labels"] = ["INBOX"]
    r = sync_inbox_for_user(db, gmail, usuario)
    assert r["nuevos"] == 0
    assert r["actualizados"] == 1
    mails = list(db.scalars(select(Mail)))
    assert len(mails) == 1
    assert mails[0].leido is True


def test_dias_ventana_default_y_tope(db: Session) -> None:
    def u(dias: int | None) -> Usuario:
        prefs = {"inbox_sync_dias": dias} if dias is not None else None
        return Usuario(email="x@x.com", nombre="X", preferencias=prefs)

    assert dias_ventana(u(None)) == 3
    assert dias_ventana(u(7)) == 7
    assert dias_ventana(u(30)) == 7  # se acota a 7 aunque pidan más
