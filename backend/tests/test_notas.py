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


def test_nota_vacia_al_inicio_y_upsert(client: TestClient) -> None:
    # Sin nota previa -> contenido vacío.
    assert client.get("/api/v1/notas").json()["contenido"] == ""

    # Guardar crea la fila.
    r = client.put("/api/v1/notas", json={"contenido": "comprar toner\nllamar a Juan"})
    assert r.status_code == 200
    assert r.json()["contenido"] == "comprar toner\nllamar a Juan"

    # Persistió.
    assert client.get("/api/v1/notas").json()["contenido"] == "comprar toner\nllamar a Juan"

    # Guardar de nuevo actualiza (no duplica).
    client.put("/api/v1/notas", json={"contenido": "actualizado"})
    assert client.get("/api/v1/notas").json()["contenido"] == "actualizado"


def test_nota_es_privada_por_usuario(client: TestClient) -> None:
    client.put("/api/v1/notas", json={"contenido": "nota de Uno"})

    # Cambiamos al usuario 2: no ve la nota de Uno.
    app.dependency_overrides[get_current_user] = lambda: Usuario(
        id=2, email="v2@argentinacolor.com", nombre="Dos", activo=True
    )
    assert client.get("/api/v1/notas").json()["contenido"] == ""
