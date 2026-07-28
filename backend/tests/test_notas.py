"""Tests del bloc de notas personal (autoguardado)."""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.deps import get_current_user
from app.db.base import Base
from app.db.models.notas_personales import NotaPersonal
from app.db.models.usuarios import Usuario
from app.db.session import get_db
from app.main import app

engine = create_engine(
    "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
)
TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


@pytest.fixture()
def client() -> Iterator[TestClient]:
    tables = [Usuario.__table__, NotaPersonal.__table__]
    Base.metadata.create_all(bind=engine, tables=tables)

    def override_get_db() -> Iterator[Session]:
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    with TestingSessionLocal() as seed:
        seed.add(Usuario(id=1, email="v@argentinacolor.com", nombre="Uno", activo=True))
        seed.add(Usuario(id=2, email="v2@argentinacolor.com", nombre="Dos", activo=True))
        seed.commit()

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = lambda: Usuario(
        id=1, email="v@argentinacolor.com", nombre="Uno", activo=True
    )
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=engine, tables=tables)


def test_crear_listar_actualizar_eliminar(client: TestClient) -> None:
    # Sin notas al inicio.
    assert client.get("/api/v1/notas").json() == []

    # Crear dos notas.
    a = client.post("/api/v1/notas", json={"contenido": "comprar toner"}).json()
    b = client.post("/api/v1/notas", json={"contenido": ""}).json()
    assert a["id"] != b["id"]

    lista = client.get("/api/v1/notas").json()
    assert len(lista) == 2

    # Actualizar una (autoguardado).
    r = client.put(f"/api/v1/notas/{b['id']}", json={"contenido": "idea nueva"})
    assert r.status_code == 200
    assert r.json()["contenido"] == "idea nueva"

    # Eliminar.
    assert client.delete(f"/api/v1/notas/{a['id']}").status_code == 204
    assert len(client.get("/api/v1/notas").json()) == 1


def test_notas_privadas_por_usuario(client: TestClient) -> None:
    mia = client.post("/api/v1/notas", json={"contenido": "nota de Uno"}).json()

    # Usuario 2 no ve las de Uno y no puede tocarlas.
    app.dependency_overrides[get_current_user] = lambda: Usuario(
        id=2, email="v2@argentinacolor.com", nombre="Dos", activo=True
    )
    assert client.get("/api/v1/notas").json() == []
    assert client.put(f"/api/v1/notas/{mia['id']}", json={"contenido": "hack"}).status_code == 404
    assert client.delete(f"/api/v1/notas/{mia['id']}").status_code == 404
