"""Tests de la carga de presupuestos en GBP (sobre el Presupuesto del CRM)."""

from collections.abc import Iterator
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.deps import get_current_user
from app.config import get_settings
from app.db.base import Base
from app.db.models.clientes import Cliente
from app.db.models.oportunidades import Oportunidad
from app.db.models.presupuesto_items import PresupuestoItem
from app.db.models.presupuestos import Presupuesto
from app.db.models.productos import Producto
from app.db.models.usuarios import Usuario
from app.db.session import get_db

TOKEN = "bot-token-test"
BOT_HEADERS = {"X-Bot-Token": TOKEN}

engine = create_engine(
    "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
)
TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


@pytest.fixture()
def client(tmp_path) -> Iterator[TestClient]:  # noqa: ANN001
    from app.main import app

    tables = [
        Usuario.__table__,
        Cliente.__table__,
        Oportunidad.__table__,
        Producto.__table__,
        Presupuesto.__table__,
        PresupuestoItem.__table__,
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
        seed.add(Cliente(id=1, razon_social="BENCEN S.A.", numero_cliente="34923", activo=True))
        seed.commit()

    settings = get_settings()
    settings.GBP_BOT_TOKEN = TOKEN
    settings.MEDIA_DIR = str(tmp_path)
    settings.STORAGE_BACKEND = "local"

    fake_user = Usuario(id=1, email="v@argentinacolor.com", nombre="Vendedor", activo=True)
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = lambda: fake_user
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=engine, tables=tables)


def _payload(**over: object) -> dict:
    base = {
        "cliente_numero": "34923",
        "entrega_por": "Retiro TML - Garin",
        "items": [
            {
                "sku": "NSVC60P",
                "descripcion": "Aspiradora 60W",
                "cantidad": 1,
                "precio_unitario": 36,
            },
            {"descripcion": "Flete", "cantidad": 1, "precio_unitario": 40, "iva": 21},
        ],
    }
    base.update(over)
    return base


def _crear(client: TestClient, **over: object) -> dict:
    r = client.post("/api/v1/presupuestos", json=_payload(**over))
    assert r.status_code == 201, r.text
    return r.json()


def test_crear_standalone_sin_oportunidad(client: TestClient) -> None:
    data = _crear(client)
    assert data["oportunidad_id"] is None
    assert data["cliente_numero"] == "34923"
    assert data["estado_carga"] is None  # todavía NO encolado a GBP


def test_cargar_gbp_encola_y_el_bot_lo_toma(client: TestClient) -> None:
    pid = _crear(client)["id"]
    r = client.post(f"/api/v1/presupuestos/{pid}/cargar-gbp")
    assert r.status_code == 200, r.text
    assert r.json()["estado_carga"] == "pendiente"

    job = client.get("/api/v1/gbp-bot/jobs/next", headers=BOT_HEADERS)
    assert job.status_code == 200, job.text
    j = job.json()
    assert j["id"] == pid
    assert j["cliente_numero"] == "34923"
    assert j["documento"] == "Presupuesto USD"
    assert j["items"][0]["tipo"] == "normal"
    assert j["items"][0]["iva"] is None  # el normal lo trae el SKU
    assert j["items"][1]["tipo"] == "manual"
    assert Decimal(j["items"][1]["iva"]) == 21

    # ya en_proceso -> no vuelve a salir
    assert client.get("/api/v1/gbp-bot/jobs/next", headers=BOT_HEADERS).status_code == 204


def test_next_sin_pendientes_da_204(client: TestClient) -> None:
    _crear(client)  # creado pero NO cargado a GBP -> no está en la cola
    assert client.get("/api/v1/gbp-bot/jobs/next", headers=BOT_HEADERS).status_code == 204


def test_token_invalido_403(client: TestClient) -> None:
    assert client.get("/api/v1/gbp-bot/jobs/next").status_code == 403
    assert client.get(
        "/api/v1/gbp-bot/jobs/next", headers={"X-Bot-Token": "mal"}
    ).status_code == 403


def test_resultado_sube_pdf_y_sirve_el_de_gbp(client: TestClient) -> None:
    pid = _crear(client)["id"]
    client.post(f"/api/v1/presupuestos/{pid}/cargar-gbp")
    client.get("/api/v1/gbp-bot/jobs/next", headers=BOT_HEADERS)

    r = client.post(
        f"/api/v1/gbp-bot/jobs/{pid}/resultado",
        headers=BOT_HEADERS,
        data={"numero_gbp": "P-0001"},
        files={"pdf": ("p.pdf", b"%PDF-1.4 contenido", "application/pdf")},
    )
    assert r.status_code == 200, r.text
    assert r.json()["estado_carga"] == "cargado"
    assert r.json()["id_gbp_pedido"] == "P-0001"

    # el PDF que sirve el CRM ahora es el oficial de GBP
    pdf = client.get(f"/api/v1/presupuestos/{pid}/pdf")
    assert pdf.status_code == 200
    assert pdf.content == b"%PDF-1.4 contenido"


def test_resultado_rechaza_no_pdf(client: TestClient) -> None:
    pid = _crear(client)["id"]
    client.post(f"/api/v1/presupuestos/{pid}/cargar-gbp")
    r = client.post(
        f"/api/v1/gbp-bot/jobs/{pid}/resultado",
        headers=BOT_HEADERS,
        data={"numero_gbp": "P-0002"},
        files={"pdf": ("p.pdf", b"no soy un pdf", "application/pdf")},
    )
    assert r.status_code == 400


def test_error_marca_error(client: TestClient) -> None:
    pid = _crear(client)["id"]
    client.post(f"/api/v1/presupuestos/{pid}/cargar-gbp")
    r = client.post(
        f"/api/v1/gbp-bot/jobs/{pid}/error",
        headers=BOT_HEADERS,
        json={"mensaje": "SKU NSVC60P no existe en GBP"},
    )
    assert r.status_code == 200
    assert r.json()["estado_carga"] == "error"


def test_cargar_sin_cliente_es_400(client: TestClient) -> None:
    pid = _crear(client, cliente_numero=None)["id"]
    r = client.post(f"/api/v1/presupuestos/{pid}/cargar-gbp")
    assert r.status_code == 400
    assert "cliente" in r.json()["detail"].lower()


def test_cargar_manual_sin_iva_es_400(client: TestClient) -> None:
    pid = _crear(
        client,
        items=[{"descripcion": "Flete", "cantidad": 1, "precio_unitario": 40}],  # manual sin IVA
    )["id"]
    r = client.post(f"/api/v1/presupuestos/{pid}/cargar-gbp")
    assert r.status_code == 400
    assert "iva" in r.json()["detail"].lower()


def test_job_colgado_se_recicla(client: TestClient) -> None:
    pid = _crear(client)["id"]
    client.post(f"/api/v1/presupuestos/{pid}/cargar-gbp")
    client.get("/api/v1/gbp-bot/jobs/next", headers=BOT_HEADERS)  # queda en_proceso

    with TestingSessionLocal() as db:
        p = db.get(Presupuesto, pid)
        p.gbp_tomado_en = datetime.now(timezone.utc) - timedelta(hours=1)
        db.commit()

    r = client.get("/api/v1/gbp-bot/jobs/next", headers=BOT_HEADERS)
    assert r.status_code == 200
    assert r.json()["id"] == pid
