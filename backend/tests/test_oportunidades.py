"""Tests del CRUD de oportunidades (SQLite en memoria, sin login real)."""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.deps import get_current_user
from app.db.base import Base
from app.db.models.clientes import Cliente
from app.db.models.contactos_cliente import ContactoCliente
from app.db.models.oportunidades import Oportunidad
from app.db.models.usuarios import Usuario
from app.db.session import get_db
from app.main import app

engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


@pytest.fixture()
def client() -> Iterator[TestClient]:
    tables = [
        Usuario.__table__,
        Cliente.__table__,
        ContactoCliente.__table__,
        Oportunidad.__table__,
    ]
    Base.metadata.create_all(bind=engine, tables=tables)

    def override_get_db() -> Iterator[Session]:
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    # Sembramos un vendedor y un cliente para enlazar la oportunidad.
    with TestingSessionLocal() as seed:
        seed.add(Usuario(id=1, email="v@argentinacolor.com", nombre="Vendedor Uno", activo=True))
        seed.add(Cliente(id=1, razon_social="BENCEN S.A.", activo=True))
        seed.commit()

    fake_user = Usuario(id=1, email="v@argentinacolor.com", nombre="Vendedor Uno", activo=True)

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = lambda: fake_user
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=engine, tables=tables)


def test_create_y_listado_con_nombres(client: TestClient) -> None:
    resp = client.post(
        "/api/v1/oportunidades",
        json={"cliente_id": 1, "vendedor_id": 1, "fuente": "manual"},
    )
    assert resp.status_code == 201
    creada = resp.json()
    assert creada["estado"] == "nueva"

    # El listado trae los nombres anidados, no solo IDs.
    items = client.get("/api/v1/oportunidades").json()
    assert len(items) == 1
    assert items[0]["cliente"]["razon_social"] == "BENCEN S.A."
    assert items[0]["vendedor"]["nombre"] == "Vendedor Uno"


def test_patch_estado_actualiza_ultimo_movimiento(client: TestClient) -> None:
    op_id = client.post("/api/v1/oportunidades", json={"cliente_id": 1}).json()["id"]
    antes = client.get(f"/api/v1/oportunidades/{op_id}").json()["fecha_ultimo_movimiento"]

    resp = client.patch(f"/api/v1/oportunidades/{op_id}", json={"estado": "en_compras"})
    assert resp.status_code == 200
    despues = resp.json()
    assert despues["estado"] == "en_compras"
    assert despues["fecha_ultimo_movimiento"] >= antes


def test_filtro_por_estado(client: TestClient) -> None:
    client.post("/api/v1/oportunidades", json={"cliente_id": 1, "estado": "nueva"})
    client.post("/api/v1/oportunidades", json={"cliente_id": 1, "estado": "ganada"})

    ganadas = client.get("/api/v1/oportunidades", params={"estado": "ganada"}).json()
    assert len(ganadas) == 1
    assert ganadas[0]["estado"] == "ganada"


def test_get_404(client: TestClient) -> None:
    assert client.get("/api/v1/oportunidades/999").status_code == 404
