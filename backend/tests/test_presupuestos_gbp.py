"""Tests de la cola de presupuestos a cargar en GBP (CRM + API del bot)."""

from collections.abc import Iterator
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.deps import get_current_user
from app.config import get_settings
from app.db.base import Base
from app.db.models.oportunidades import Oportunidad
from app.db.models.presupuestos_gbp import PresupuestoGbp, PresupuestoGbpItem
from app.db.models.usuarios import Usuario
from app.db.session import get_db
from app.main import app

TOKEN = "bot-token-test"
BOT_HEADERS = {"X-Bot-Token": TOKEN}

engine = create_engine(
    "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
)
TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


@pytest.fixture()
def client(tmp_path) -> Iterator[TestClient]:  # noqa: ANN001
    tables = [
        Usuario.__table__,
        Oportunidad.__table__,
        PresupuestoGbp.__table__,
        PresupuestoGbpItem.__table__,
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


def _payload(encolar: bool = True, **over: object) -> dict:
    base = {
        "cliente_numero": "34923",
        "entrega_por": "Retiro TML - Garin",
        "encolar": encolar,
        "items": [
            {"sku": "NSVC60P", "descripcion": "Aspiradora 60W", "cantidad": 1, "precio_usd": 36},
            {"descripcion": "Flete", "cantidad": 1, "precio_usd": 40, "iva": 21},
        ],
    }
    base.update(over)
    return base


def test_crear_encola_y_marca_tipos(client: TestClient) -> None:
    r = client.post("/api/v1/presupuestos-gbp", json=_payload())
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["estado_carga"] == "pendiente"
    assert data["items"][0]["tipo"] == "normal"  # trae SKU
    assert data["items"][1]["tipo"] == "manual"  # sin SKU
    assert data["items"][1]["iva"] == "21.00"


def test_bot_toma_el_job(client: TestClient) -> None:
    pid = client.post("/api/v1/presupuestos-gbp", json=_payload()).json()["id"]

    r = client.get("/api/v1/gbp-bot/jobs/next", headers=BOT_HEADERS)
    assert r.status_code == 200, r.text
    job = r.json()
    assert job["id"] == pid
    assert job["cliente_numero"] == "34923"
    assert job["entrega_por"] == "Retiro TML - Garin"
    assert job["fecha_entrega"] == "today"
    assert len(job["items"]) == 2
    assert job["items"][0]["sku"] == "NSVC60P"

    # ya quedó en_proceso -> no vuelve a salir
    assert client.get("/api/v1/gbp-bot/jobs/next", headers=BOT_HEADERS).status_code == 204


def test_next_sin_pendientes_da_204(client: TestClient) -> None:
    assert client.get("/api/v1/gbp-bot/jobs/next", headers=BOT_HEADERS).status_code == 204


def test_borrador_no_lo_ve_el_bot(client: TestClient) -> None:
    client.post("/api/v1/presupuestos-gbp", json=_payload(encolar=False, cliente_numero=None))
    assert client.get("/api/v1/gbp-bot/jobs/next", headers=BOT_HEADERS).status_code == 204


def test_token_invalido_403(client: TestClient) -> None:
    assert client.get("/api/v1/gbp-bot/jobs/next").status_code == 403
    assert client.get(
        "/api/v1/gbp-bot/jobs/next", headers={"X-Bot-Token": "mal"}
    ).status_code == 403


def test_resultado_sube_pdf_y_marca_cargado(client: TestClient) -> None:
    pid = client.post("/api/v1/presupuestos-gbp", json=_payload()).json()["id"]
    client.get("/api/v1/gbp-bot/jobs/next", headers=BOT_HEADERS)

    r = client.post(
        f"/api/v1/gbp-bot/jobs/{pid}/resultado",
        headers=BOT_HEADERS,
        data={"numero_gbp": "P-0001"},
        files={"pdf": ("p.pdf", b"%PDF-1.4 contenido", "application/pdf")},
    )
    assert r.status_code == 200, r.text
    assert r.json()["estado_carga"] == "cargado"
    assert r.json()["numero_gbp"] == "P-0001"

    pdf = client.get(f"/api/v1/presupuestos-gbp/{pid}/pdf")
    assert pdf.status_code == 200
    assert pdf.content.startswith(b"%PDF")


def test_resultado_rechaza_no_pdf(client: TestClient) -> None:
    pid = client.post("/api/v1/presupuestos-gbp", json=_payload()).json()["id"]
    r = client.post(
        f"/api/v1/gbp-bot/jobs/{pid}/resultado",
        headers=BOT_HEADERS,
        data={"numero_gbp": "P-0002"},
        files={"pdf": ("p.pdf", b"esto no es un pdf", "application/pdf")},
    )
    assert r.status_code == 400


def test_error_marca_error(client: TestClient) -> None:
    pid = client.post("/api/v1/presupuestos-gbp", json=_payload()).json()["id"]
    r = client.post(
        f"/api/v1/gbp-bot/jobs/{pid}/error",
        headers=BOT_HEADERS,
        json={"mensaje": "SKU NSVC60P no existe en GBP"},
    )
    assert r.status_code == 200
    assert r.json()["estado_carga"] == "error"
    assert "NSVC60P" in r.json()["error_mensaje"]


def test_manual_sin_iva_es_422(client: TestClient) -> None:
    mal = _payload()
    mal["items"] = [{"descripcion": "Flete", "cantidad": 1, "precio_usd": 40}]  # manual sin IVA
    assert client.post("/api/v1/presupuestos-gbp", json=mal).status_code == 422


def test_encolar_sin_cliente_es_422(client: TestClient) -> None:
    assert client.post(
        "/api/v1/presupuestos-gbp", json=_payload(cliente_numero=None)
    ).status_code == 422


def test_job_colgado_se_recicla(client: TestClient) -> None:
    pid = client.post("/api/v1/presupuestos-gbp", json=_payload()).json()["id"]
    client.get("/api/v1/gbp-bot/jobs/next", headers=BOT_HEADERS)  # queda en_proceso

    # backdatear tomado_en como si el bot hubiera crasheado hace rato
    with TestingSessionLocal() as db:
        job = db.get(PresupuestoGbp, pid)
        job.tomado_en = datetime.now(timezone.utc) - timedelta(hours=1)
        db.commit()

    # el próximo next lo recicla y lo vuelve a entregar
    r = client.get("/api/v1/gbp-bot/jobs/next", headers=BOT_HEADERS)
    assert r.status_code == 200
    assert r.json()["id"] == pid
