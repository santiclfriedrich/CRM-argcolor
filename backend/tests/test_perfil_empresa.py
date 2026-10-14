"""Tests del Perfil de Empresa (configuración editable para formularios)."""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.deps import get_current_user
from app.db.base import Base
from app.db.models.configuracion import Configuracion
from app.db.models.usuarios import Usuario
from app.db.session import get_db
from app.main import app

engine = create_engine(
    "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
)
TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
_TABLES = [Usuario.__table__, Configuracion.__table__]


@pytest.fixture()
def client() -> Iterator[TestClient]:
    Base.metadata.create_all(bind=engine, tables=_TABLES)

    def override_get_db() -> Iterator[Session]:
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    fake_user = Usuario(id=1, email="v@argentinacolor.com", nombre="Vendedor", activo=True)
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = lambda: fake_user
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=engine, tables=_TABLES)


def test_perfil_trae_defaults_precargados(client: TestClient) -> None:
    perfil = client.get("/api/v1/configuracion/perfil-empresa").json()
    # Precargado de los PDFs extraídos.
    assert perfil["razon_social"] == "MERCADOS DIGITALES S.A."
    assert perfil["cuit"] == "30-71737169-7"
    assert perfil["cbu"] == "0070303920000005964413"
    assert perfil["condicion_iva"] == "Responsable Inscripto"
    # Los que faltan vienen vacíos.
    assert perfil["telefono"] == ""


def test_perfil_se_guarda_y_persiste(client: TestClient) -> None:
    perfil = client.get("/api/v1/configuracion/perfil-empresa").json()
    perfil["telefono"] = "+54 11 1234-5678"
    perfil["email"] = "ventas@mercadosdigitales.com"

    r = client.put("/api/v1/configuracion/perfil-empresa", json=perfil)
    assert r.status_code == 200, r.text
    assert r.json()["telefono"] == "+54 11 1234-5678"

    # Relee: quedó guardado.
    recargado = client.get("/api/v1/configuracion/perfil-empresa").json()
    assert recargado["telefono"] == "+54 11 1234-5678"
    assert recargado["email"] == "ventas@mercadosdigitales.com"
    assert recargado["razon_social"] == "MERCADOS DIGITALES S.A."
