"""Tests del ABM de usuarios (gating admin, duplicados, auto-protección, baja)."""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.deps import get_current_user
from app.db.base import Base
from app.db.models.clientes import Cliente
from app.db.models.oportunidades import Oportunidad
from app.db.models.usuarios import RolUsuario, Usuario
from app.db.session import get_db
from app.main import app

engine = create_engine(
    "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
)
TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

_admin = Usuario(id=1, email="santiago.c@argentinacolor.com", nombre="Santi", rol=RolUsuario.admin)
_vendedor = Usuario(id=2, email="vend@argentinacolor.com", nombre="Vend", rol=RolUsuario.vendedor)
_current: dict[str, Usuario] = {"user": _admin}


@pytest.fixture()
def client() -> Iterator[TestClient]:
    tables = [Usuario.__table__, Cliente.__table__, Oportunidad.__table__]
    Base.metadata.create_all(bind=engine, tables=tables)

    def override_get_db() -> Iterator[Session]:
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    with TestingSessionLocal() as seed:
        seed.add(Usuario(id=1, email="santiago.c@argentinacolor.com", nombre="Santi",
                          rol=RolUsuario.admin, activo=True))
        seed.add(Usuario(id=2, email="vend@argentinacolor.com", nombre="Vend",
                         rol=RolUsuario.vendedor, activo=True))
        seed.commit()

    _current["user"] = _admin
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = lambda: _current["user"]
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=engine, tables=tables)


def test_admin_da_de_alta_y_lista(client: TestClient) -> None:
    resp = client.post(
        "/api/v1/usuarios",
        json={"email": "nuevo@argentinacolor.com", "nombre": "Nuevo", "rol": "vendedor"},
    )
    assert resp.status_code == 201
    assert resp.json()["email"] == "nuevo@argentinacolor.com"
    assert len(client.get("/api/v1/usuarios").json()) == 3


def test_no_admin_no_puede_dar_de_alta(client: TestClient) -> None:
    _current["user"] = _vendedor
    resp = client.post(
        "/api/v1/usuarios",
        json={"email": "x@argentinacolor.com", "nombre": "X", "rol": "vendedor"},
    )
    assert resp.status_code == 403


def test_email_duplicado_da_409(client: TestClient) -> None:
    resp = client.post(
        "/api/v1/usuarios",
        json={"email": "vend@argentinacolor.com", "nombre": "Otro", "rol": "vendedor"},
    )
    assert resp.status_code == 409


def test_admin_no_se_desactiva_a_si_mismo(client: TestClient) -> None:
    resp = client.patch("/api/v1/usuarios/1", json={"activo": False})
    assert resp.status_code == 400


def test_baja_bloqueada_si_tiene_oportunidades(client: TestClient) -> None:
    with TestingSessionLocal() as db:
        db.add(Oportunidad(id=1, vendedor_id=2, estado="nueva"))
        db.commit()
    resp = client.delete("/api/v1/usuarios/2")
    assert resp.status_code == 409


def test_baja_ok_si_no_tiene_historial(client: TestClient) -> None:
    nuevo_id = client.post(
        "/api/v1/usuarios",
        json={"email": "borrar@argentinacolor.com", "nombre": "Borrar", "rol": "vendedor"},
    ).json()["id"]
    assert client.delete(f"/api/v1/usuarios/{nuevo_id}").status_code == 204
