"""Tests del acuse de recibo (envío por Gmail con un fake)."""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.deps import get_ai, get_current_user, get_gmail
from app.db.base import Base
from app.db.models.clientes import Cliente
from app.db.models.configuracion import Configuracion
from app.db.models.contactos_cliente import ContactoCliente
from app.db.models.dominios_cliente import DominioCliente
from app.db.models.mails import DireccionMail, Mail
from app.db.models.oportunidades import Oportunidad
from app.db.models.usuarios import Usuario
from app.db.session import get_db
from app.integrations.ai.base import AIProvider, EmailData
from app.main import app

engine = create_engine(
    "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
)
TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class FakeAI(AIProvider):
    def extract_email_data(self, email_text, image_paths=None) -> EmailData:  # noqa: ANN001
        return EmailData(producto="Pigmento")

    def draft_quote(self, compras_response):  # noqa: ANN001
        raise NotImplementedError

    def summarize_thread(self, messages):  # noqa: ANN001
        return ""


class FakeGmail:
    """Captura los envíos en vez de pegarle a la API real."""

    def __init__(self) -> None:
        self.sent: list[dict] = []

    def send_message(self, to, subject, body, thread_id=None):  # noqa: ANN001
        self.sent.append({"to": to, "subject": subject, "body": body, "thread_id": thread_id})
        return {"message_id": "sent-1", "thread_id": thread_id or "t-new"}


_fake_gmail = FakeGmail()


@pytest.fixture()
def client() -> Iterator[TestClient]:
    tables = [
        Usuario.__table__,
        Cliente.__table__,
        ContactoCliente.__table__,
        DominioCliente.__table__,
        Oportunidad.__table__,
        Mail.__table__,
        Configuracion.__table__,
    ]
    Base.metadata.create_all(bind=engine, tables=tables)

    def override_get_db() -> Iterator[Session]:
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    with TestingSessionLocal() as seed:
        seed.add(Usuario(id=1, email="v@argentinacolor.com", nombre="Vendedor", activo=True))
        seed.add(Cliente(id=1, razon_social="BENCEN S.A.", activo=True))
        seed.add(DominioCliente(id=1, cliente_id=1, dominio="bencen.com.ar"))
        seed.add(
            ContactoCliente(id=1, cliente_id=1, nombre="Juan Perez", email="juan@bencen.com.ar")
        )
        seed.commit()

    _fake_gmail.sent.clear()
    fake_user = Usuario(id=1, email="v@argentinacolor.com", nombre="Vendedor", activo=True)
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = lambda: fake_user
    app.dependency_overrides[get_ai] = lambda: FakeAI()
    app.dependency_overrides[get_gmail] = lambda: _fake_gmail
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=engine, tables=tables)


def test_acuse_se_envia_y_registra_saliente(client: TestClient) -> None:
    # Ingesta de un mail de un contacto conocido (Juan).
    mail = client.post(
        "/api/v1/mails/ingest",
        json={"de": "juan@bencen.com.ar", "asunto": "Pedido", "cuerpo": "Necesito 100kg"},
    ).json()

    resp = client.post(f"/api/v1/mails/{mail['id']}/acuse")
    assert resp.status_code == 201
    salida = resp.json()
    assert salida["direccion"] == "saliente"
    assert salida["para"] == "juan@bencen.com.ar"

    # Se envió por Gmail, personalizado con el nombre del contacto.
    assert len(_fake_gmail.sent) == 1
    assert "Juan" in _fake_gmail.sent[0]["body"]

    # Quedó registrado el saliente en la tabla mails.
    with TestingSessionLocal() as db:
        salientes = db.scalar(
            select(func.count()).select_from(Mail).where(Mail.direccion == DireccionMail.saliente)
        )
        assert salientes == 1


def test_flags_automatizacion_get_y_put(client: TestClient) -> None:
    # Defaults: acuse automático, aclaración manual.
    defaults = client.get("/api/v1/configuracion/automatizacion").json()
    assert defaults == {"acuse_automatico": True, "aclaracion_automatica": False}

    # Cambiar la aclaración a automática persiste.
    resp = client.put(
        "/api/v1/configuracion/automatizacion", json={"aclaracion_automatica": True}
    )
    assert resp.status_code == 200
    assert resp.json()["aclaracion_automatica"] is True
    again = client.get("/api/v1/configuracion/automatizacion").json()
    assert again["aclaracion_automatica"] is True


def test_enviar_aclaracion_usa_borrador_de_ia(client: TestClient) -> None:
    # IA que marca requiere_aclaracion con borrador.
    from app.api.deps import get_ai

    app.dependency_overrides[get_ai] = lambda: _AclaracionAI()
    mail = client.post(
        "/api/v1/mails/ingest",
        json={"de": "juan@bencen.com.ar", "asunto": "Consulta", "cuerpo": "necesito algo"},
    ).json()

    resp = client.post(f"/api/v1/mails/{mail['id']}/aclaracion")
    assert resp.status_code == 201
    assert resp.json()["direccion"] == "saliente"
    # Mandó el borrador que escribió la IA.
    assert _fake_gmail.sent[-1]["body"] == "¿Qué producto necesitás?"


class _AclaracionAI(AIProvider):
    def extract_email_data(self, email_text, image_paths=None) -> EmailData:  # noqa: ANN001
        return EmailData(requiere_aclaracion=True, borrador_aclaracion="¿Qué producto necesitás?")

    def draft_quote(self, compras_response):  # noqa: ANN001
        raise NotImplementedError

    def summarize_thread(self, messages):  # noqa: ANN001
        return ""
