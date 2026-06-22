"""Tests del CRUD de clientes con sus contactos y dominios anidados.

Usa SQLite en memoria y overrides de dependencias para no depender de
Postgres ni del login real con Google.
"""

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
from app.db.models.dominios_cliente import DominioCliente
from app.db.models.usuarios import Usuario
from app.db.session import get_db
from app.main import app

# Engine SQLite compartido entre conexiones del mismo test.
engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


@pytest.fixture()
def client() -> Iterator[TestClient]:
    # Solo las tablas que toca este flujo (evita tipos Postgres como JSONB/ARRAY).
    tables = [
        Usuario.__table__,
        Cliente.__table__,
        ContactoCliente.__table__,
        DominioCliente.__table__,
    ]
    Base.metadata.create_all(bind=engine, tables=tables)

    def override_get_db() -> Iterator[Session]:
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    fake_user = Usuario(id=1, email="santiago.c@argentinacolor.com", nombre="Santiago", activo=True)

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = lambda: fake_user
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=engine, tables=tables)


def test_cliente_crud_flow(client: TestClient) -> None:
    # Crear cliente.
    resp = client.post("/api/v1/clientes", json={"razon_social": "BENCEN S.A.", "cuit": "30-111-2"})
    assert resp.status_code == 201
    cliente_id = resp.json()["id"]

    # Aparece en el listado.
    resp = client.get("/api/v1/clientes")
    assert resp.status_code == 200
    assert any(c["id"] == cliente_id for c in resp.json())

    # Editar.
    resp = client.patch(f"/api/v1/clientes/{cliente_id}", json={"notas": "Cliente clave"})
    assert resp.status_code == 200
    assert resp.json()["notas"] == "Cliente clave"

    # Detalle: contactos y dominios vacíos al inicio.
    resp = client.get(f"/api/v1/clientes/{cliente_id}")
    assert resp.status_code == 200
    detail = resp.json()
    assert detail["contactos"] == []
    assert detail["dominios"] == []


def test_contactos_nested(client: TestClient) -> None:
    cliente_id = client.post("/api/v1/clientes", json={"razon_social": "ACME"}).json()["id"]

    # Crear contacto con email y rol.
    resp = client.post(
        f"/api/v1/clientes/{cliente_id}/contactos",
        json={"nombre": "Juan", "email": "juan@acme.com", "rol_compra": "compras"},
    )
    assert resp.status_code == 201
    contacto_id = resp.json()["id"]
    assert resp.json()["rol_compra"] == "compras"

    # Aparece en el detalle del cliente.
    detail = client.get(f"/api/v1/clientes/{cliente_id}").json()
    assert len(detail["contactos"]) == 1

    # Editar y borrar.
    resp = client.patch(
        f"/api/v1/clientes/{cliente_id}/contactos/{contacto_id}", json={"es_principal": True}
    )
    assert resp.json()["es_principal"] is True
    deleted = client.delete(f"/api/v1/clientes/{cliente_id}/contactos/{contacto_id}")
    assert deleted.status_code == 204
    assert client.get(f"/api/v1/clientes/{cliente_id}/contactos").json() == []


def test_dominios_nested_and_normalization(client: TestClient) -> None:
    cliente_id = client.post("/api/v1/clientes", json={"razon_social": "BENCEN"}).json()["id"]

    # El dominio se normaliza a minúsculas / sin espacios.
    resp = client.post(
        f"/api/v1/clientes/{cliente_id}/dominios", json={"dominio": "  BenceN.com.AR "}
    )
    assert resp.status_code == 201
    assert resp.json()["dominio"] == "bencen.com.ar"


def test_nested_404_on_unknown_cliente(client: TestClient) -> None:
    assert client.get("/api/v1/clientes/999/contactos").status_code == 404
    assert (
        client.post("/api/v1/clientes/999/dominios", json={"dominio": "x.com"}).status_code == 404
    )


def test_contacto_de_otro_cliente_no_se_cruza(client: TestClient) -> None:
    a = client.post("/api/v1/clientes", json={"razon_social": "A"}).json()["id"]
    b = client.post("/api/v1/clientes", json={"razon_social": "B"}).json()["id"]
    contacto_id = client.post(
        f"/api/v1/clientes/{a}/contactos", json={"nombre": "Ana"}
    ).json()["id"]

    # El contacto de A no debe ser accesible/editable bajo B.
    assert (
        client.patch(
            f"/api/v1/clientes/{b}/contactos/{contacto_id}", json={"nombre": "X"}
        ).status_code
        == 404
    )
