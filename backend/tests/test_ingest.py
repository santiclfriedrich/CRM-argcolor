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
from app.db.models.mails_descartados import MailDescartado
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
        MailDescartado.__table__,
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
    mail = resp.json()["mail"]
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
    op_id = resp.json()["mail"]["oportunidad_id"]
    op = client.get(f"/api/v1/oportunidades/{op_id}").json()
    assert op["cliente_id"] is None  # por identificar
    # Sin cliente asignado, la oportunidad queda a nombre del usuario logueado.
    assert op["vendedor_id"] == 1


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
    op_id = resp.json()["mail"]["oportunidad_id"]
    op = client.get(f"/api/v1/oportunidades/{op_id}").json()
    assert op["estado"] == "requiere_aclaracion"
    assert resp.json()["mail"]["datos_extraidos_ia"]["borrador_aclaracion"]


def test_bandeja_lista_entrantes(client: TestClient) -> None:
    client.post("/api/v1/mails/ingest", json={"de": "juan@bencen.com.ar", "cuerpo": "x"})
    items = client.get("/api/v1/mails").json()
    assert len(items) == 1
    assert items[0]["direccion"] == "entrante"


def test_ingesta_deduplica_por_cliente_y_asunto(client: TestClient) -> None:
    from sqlalchemy import func, select

    # Primer mail: crea la oportunidad.
    r1 = client.post(
        "/api/v1/mails/ingest",
        json={"de": "juan@bencen.com.ar", "asunto": "Cotización pigmento", "cuerpo": "100kg"},
    )
    op1 = r1.json()["mail"]["oportunidad_id"]

    # Respuesta del cliente (mismo asunto con "Re:", sin hilo / otra casilla):
    # se adjunta a la MISMA oportunidad en vez de duplicar.
    r2 = client.post(
        "/api/v1/mails/ingest",
        json={
            "de": "juan@bencen.com.ar",
            "asunto": "Re: Cotización pigmento",
            "cuerpo": "Confirmo",
        },
    )
    assert r2.status_code == 201
    assert r2.json()["mail"]["oportunidad_id"] == op1  # misma oportunidad

    with TestingSessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(Oportunidad)) == 1  # no duplicó
        assert db.scalar(select(func.count()).select_from(Mail)) == 2  # ambos mails quedaron

    # Un asunto distinto del mismo cliente SÍ crea otra oportunidad.
    r3 = client.post(
        "/api/v1/mails/ingest",
        json={"de": "juan@bencen.com.ar", "asunto": "Otro pedido distinto", "cuerpo": "x"},
    )
    assert r3.json()["mail"]["oportunidad_id"] != op1


def test_ingesta_no_comercial_descarta_sin_crear_oportunidad(client: TestClient) -> None:
    # IA que clasifica el mail como orden de compra (no comercial).
    app.dependency_overrides[get_ai] = lambda: FakeAI(
        EmailData(categoria="orden_compra")
    )
    resp = client.post(
        "/api/v1/mails/ingest",
        json={
            "de": "mesadeentrada@bencen.com.ar",
            "asunto": "Orden de Compra Nº 32787",
            "cuerpo": "Adjuntamos la orden de compra. La factura deberá enviarse a...",
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["descartado"] is True
    assert body["categoria"] == "orden_compra"
    assert body["mail"] is None

    # No se creó oportunidad ni quedó en la bandeja; sí un registro mínimo.
    from sqlalchemy import func, select

    with TestingSessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(Oportunidad)) == 0
        assert db.scalar(select(func.count()).select_from(Mail)) == 0
        descartado = db.scalars(select(MailDescartado)).first()
        assert descartado is not None and descartado.categoria == "orden_compra"
    assert client.get("/api/v1/mails").json() == []

    # Aparece en el listado de descartados (para auditarlo).
    descartados = client.get("/api/v1/mails/descartados").json()
    assert len(descartados) == 1
    assert descartados[0]["categoria"] == "orden_compra"
    assert descartados[0]["de"] == "mesadeentrada@bencen.com.ar"
