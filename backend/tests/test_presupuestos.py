"""Tests del armador de presupuestos (totales, estado, PDF)."""

from collections.abc import Iterator
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.deps import get_current_user, get_user_gmail
from app.db.base import Base
from app.db.models.clientes import Cliente
from app.db.models.mails import Mail
from app.db.models.oportunidades import EstadoOportunidad, Oportunidad
from app.db.models.presupuesto_items import PresupuestoItem
from app.db.models.presupuestos import Presupuesto
from app.db.models.productos import Producto
from app.db.models.usuarios import Usuario
from app.db.session import get_db
from app.main import app


class FakeGmail:
    def __init__(self) -> None:
        self.enviado: dict | None = None

    def send_message(self, to, subject, body, thread_id=None, in_reply_to=None, cc=None, attachments=None):  # noqa: ANN001, E501
        self.enviado = {"to": to, "subject": subject, "attachments": attachments or []}
        return {"message_id": "m-1", "thread_id": None}


_fake_gmail = FakeGmail()

engine = create_engine(
    "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
)
TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


@pytest.fixture()
def client() -> Iterator[TestClient]:
    tables = [
        Usuario.__table__,
        Cliente.__table__,
        Oportunidad.__table__,
        Producto.__table__,
        Presupuesto.__table__,
        PresupuestoItem.__table__,
        Mail.__table__,
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
        seed.add(
            Oportunidad(id=1, cliente_id=1, vendedor_id=1, estado=EstadoOportunidad.nueva)
        )
        seed.commit()

    _fake_gmail.enviado = None
    fake_user = Usuario(id=1, email="v@argentinacolor.com", nombre="Vendedor", activo=True)
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = lambda: fake_user
    app.dependency_overrides[get_user_gmail] = lambda: _fake_gmail
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=engine, tables=tables)


def _payload() -> dict:
    return {
        "oportunidad_id": 1,
        "condicion_pago": "30 días",
        "moneda": "USD",
        "items": [
            {"descripcion": "Pigmento rojo", "cantidad": 10, "precio_unitario": 100},
            {"descripcion": "Solvente", "cantidad": 2, "precio_unitario": 50, "descuento_pct": 10},
        ],
    }


def test_crear_presupuesto_calcula_totales_y_avanza_oportunidad(client: TestClient) -> None:
    resp = client.post("/api/v1/presupuestos", json=_payload())
    assert resp.status_code == 201
    data = resp.json()

    # Código correlativo y totales bien calculados (1000 + 90 = 1090).
    assert data["codigo"].startswith("P-")
    assert data["estado"] == "borrador"
    assert float(data["monto_total"]) == 1090.0
    subtotales = {i["descripcion"]: float(i["subtotal"]) for i in data["items"]}
    assert subtotales == {"Pigmento rojo": 1000.0, "Solvente": 90.0}

    # La oportunidad avanzó a "presupuestada".
    op = client.get("/api/v1/oportunidades/1").json()
    assert op["estado"] == "presupuestada"


def test_actualizar_reemplaza_items_y_recalcula(client: TestClient) -> None:
    pid = client.post("/api/v1/presupuestos", json=_payload()).json()["id"]

    resp = client.patch(
        f"/api/v1/presupuestos/{pid}",
        json={"items": [{"descripcion": "Solo un item", "cantidad": 3, "precio_unitario": 100}]},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["items"]) == 1
    assert float(data["monto_total"]) == 300.0
    assert data["pdf_url"] is None  # el cambio invalida el PDF anterior


def test_generar_pdf_devuelve_un_pdf(client: TestClient) -> None:
    pid = client.post("/api/v1/presupuestos", json=_payload()).json()["id"]
    resp = client.get(f"/api/v1/presupuestos/{pid}/pdf")
    # weasyprint puede no estar disponible (libs nativas): en ese caso es 503.
    if resp.status_code == 503:
        pytest.skip("weasyprint sin libs nativas en este entorno")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert resp.content[:5] == b"%PDF-"


def test_calcular_subtotal_con_descuento() -> None:
    from app.services.presupuestos import calcular_subtotal

    class _It:
        cantidad = Decimal(4)
        precio_unitario = Decimal("25.50")
        descuento_pct = Decimal(25)

    assert calcular_subtotal(_It()) == Decimal("76.50")  # 4*25.5*0.75


def test_enviar_presupuesto_al_cliente(client: TestClient) -> None:
    pid = client.post("/api/v1/presupuestos", json=_payload()).json()["id"]
    resp = client.post(f"/api/v1/presupuestos/{pid}/enviar", json={"to": "cliente@bencen.com.ar"})
    if resp.status_code == 503:
        pytest.skip("weasyprint sin libs nativas en este entorno")
    assert resp.status_code == 200
    data = resp.json()
    assert data["estado"] == "enviado"
    assert data["fecha_envio"] is not None
    # Se envió al destinatario con el PDF adjunto.
    assert _fake_gmail.enviado["to"] == "cliente@bencen.com.ar"
    assert len(_fake_gmail.enviado["attachments"]) == 1
    assert _fake_gmail.enviado["attachments"][0]["filename"].endswith(".pdf")


def test_enviar_sin_email_da_400(client: TestClient) -> None:
    pid = client.post("/api/v1/presupuestos", json=_payload()).json()["id"]
    # Sin `to` y sin contacto en la oportunidad -> 400.
    resp = client.post(f"/api/v1/presupuestos/{pid}/enviar", json={})
    assert resp.status_code == 400
