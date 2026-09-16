"""Tests de la limpieza del inbox (borra solo ruido viejo, protege lo importante)."""

from collections.abc import Iterator
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.db.models.adjuntos import Adjunto
from app.db.models.mails import DireccionMail, Mail
from app.services.limpieza import limpiar_inbox_viejo

engine = create_engine(
    "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
)
TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

_TABLES = [Mail.__table__, Adjunto.__table__]


@pytest.fixture()
def db() -> Iterator[Session]:
    Base.metadata.create_all(bind=engine, tables=_TABLES)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine, tables=_TABLES)


def _mail(**kw) -> Mail:  # noqa: ANN003
    base = {
        "direccion": DireccionMail.entrante,
        "carpeta": "entrada",
        "leido": False,
        "oportunidad_id": None,
        "fecha": datetime.now(timezone.utc) - timedelta(days=20),
    }
    base.update(kw)
    return Mail(**base)


def test_limpia_solo_viejo_no_leido_no_vinculado(db: Session) -> None:
    viejo = _mail(gmail_message_id="borrar")  # viejo, no leído, sin oportunidad
    leido = _mail(gmail_message_id="leido", leido=True)  # abierto -> se conserva
    vinculado = _mail(gmail_message_id="op", oportunidad_id=1)  # vinculado -> se conserva
    reciente = _mail(
        gmail_message_id="reciente",
        fecha=datetime.now(timezone.utc) - timedelta(days=2),
    )  # dentro de la ventana -> se conserva
    fuera = _mail(gmail_message_id="nocarpeta", carpeta=None)  # no es del inbox
    db.add_all([viejo, leido, vinculado, reciente, fuera])
    db.commit()

    borrados = limpiar_inbox_viejo(db, dias=15)
    assert borrados == 1

    quedan = {m.gmail_message_id for m in db.scalars(select(Mail))}
    assert quedan == {"leido", "op", "reciente", "nocarpeta"}
