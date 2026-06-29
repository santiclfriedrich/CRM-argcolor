"""Tests del pipeline de ingesta de mails (Slice 1, con IA fake)."""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.deps import get_ai, get_current_user
from app.db.base import Base
from app.db.models.adjuntos import Adjunto
from app.db.models.clientes import Cliente
from app.db.models.contactos_cliente import ContactoCliente
from app.db.models.dominios_cliente import DominioCliente
from app.db.models.mails import Mail
from app.db.models.oportunidades import Oportunidad
from app.db.models.usuarios import Usuario
from app.db.session import get_db
from app.integrations.ai.base import AIProvider, EmailData
from app.main import app

engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class FakeAI(AIProvider):
    """IA controlable por test: devuelve lo que se le configure."""

    def __init__(self, data: EmailData) -> None:
        self.data = data

    def extract_email_data(self, email_text, image_paths=None) -> EmailData:  # noqa: ANN001
        return self.data

    def draft_quote(self, compras_response):  # noqa: ANN001
        raise NotImplementedError

    def summarize_thread(self, messages):  # noqa: ANN001
        return "resumen"


# La IA por defecto en los tests: pedido claro (no requiere aclaración).
_fake = FakeAI(EmailData(producto="Pigmento rojo", cantidad="100 kg", requerimiento="Cotizar"))


@pytest.fixture()
def client() -> Iterator[TestClient]:
    tables = [
        Usuario.__table__,
        Cliente.__table__,
        ContactoCliente.__table__,
        DominioCliente.__table__,
        Oportunidad.__table__,
        Mail.__table__,
        Adjunto.__table__,
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
        seed.add(Cliente(id=1, razon_social="BENCEN S.A.", vendedor_asignado_id=1, activo=True))
        seed.add(DominioCliente(id=1, cliente_id=1, dominio="bencen.com.ar"))
        seed.add(
            ContactoCliente(id=1, cliente_id=1, nombre="Juan", email="juan@bencen.com.ar")
        )
        seed.commit()

    fake_user = Usuario(id=1, email="v@argentinacolor.com", nombre="Vendedor", activo=True)

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = lambda: fake_user
    app.dependency_overrides[get_ai] = lambda: _fake
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=engine, tables=tables)


def test_ingesta_identifica_cliente_y_contacto_por_dominio(client: TestClient) -> None:
    resp = client.post(
        "/api/v1/mails/ingest",
        json={"de": "juan@bencen.com.ar", "asunto": "Pedido", "cuerpo": "Necesito 100kg"},
    )
    assert resp.status_code == 201
    mail = resp.json()
    # Identificó cliente (por dominio) y contacto (por email), y heredó el vendedor.
    assert mail["oportunidad"]["cliente"]["razon_social"] == "BENCEN S.A."
    assert mail["datos_extraidos_ia"]["producto"] == "Pigmento rojo"

    op = client.get(f"/api/v1/oportunidades/{mail['oportunidad_id']}").json()
    assert op["estado"] == "nueva"
    assert op["cliente_id"] == 1
    assert op["contacto_cliente_id"] == 1
    assert op["vendedor_id"] == 1
    assert op["fuente"] == "mail"


def test_ingesta_dominio_desconocido_queda_sin_cliente(client: TestClient) -> None:
    resp = client.post(
        "/api/v1/mails/ingest",
        json={"de": "alguien@desconocido.com", "cuerpo": "hola"},
    )
    assert resp.status_code == 201
    op_id = resp.json()["oportunidad_id"]
    op = client.get(f"/api/v1/oportunidades/{op_id}").json()
    assert op["cliente_id"] is None  # por identificar


def test_ingesta_requiere_aclaracion(client: TestClient) -> None:
    # Cambiamos la IA fake para este test: pedido vago.
    app.dependency_overrides[get_ai] = lambda: FakeAI(
        EmailData(requiere_aclaracion=True, borrador_aclaracion="¿Qué producto necesitás?")
    )
    resp = client.post(
        "/api/v1/mails/ingest",
        json={"de": "juan@bencen.com.ar", "cuerpo": "necesito algo"},
    )
    assert resp.status_code == 201
    op_id = resp.json()["oportunidad_id"]
    op = client.get(f"/api/v1/oportunidades/{op_id}").json()
    assert op["estado"] == "requiere_aclaracion"
    assert resp.json()["datos_extraidos_ia"]["borrador_aclaracion"]


def test_bandeja_lista_entrantes(client: TestClient) -> None:
    client.post("/api/v1/mails/ingest", json={"de": "juan@bencen.com.ar", "cuerpo": "x"})
    items = client.get("/api/v1/mails").json()
    assert len(items) == 1
    assert items[0]["direccion"] == "entrante"
