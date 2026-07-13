"""Tests del módulo de tareas (agenda / to-do)."""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.deps import get_current_user
from app.db.base import Base
from app.db.models.clientes import Cliente
from app.db.models.notificaciones import Notificacion
from app.db.models.oportunidades import Oportunidad
from app.db.models.tareas import Tarea
from app.db.models.usuarios import Usuario
from app.db.session import get_db
from app.main import app

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
        Tarea.__table__,
        Notificacion.__table__,
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
        seed.add(Usuario(id=2, email="otro@argentinacolor.com", nombre="Otro", activo=True))
        seed.commit()

    fake_user = Usuario(id=1, email="v@argentinacolor.com", nombre="Vendedor", activo=True)
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = lambda: fake_user
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=engine, tables=tables)


def test_crear_listar_y_completar(client: TestClient) -> None:
    creada = client.post(
        "/api/v1/tareas",
        json={"titulo": "Llamar a BENCEN", "prioridad": "alta", "fecha_vencimiento": "2026-07-20"},
    ).json()
    assert creada["titulo"] == "Llamar a BENCEN"
    assert creada["completada"] is False

    pendientes = client.get("/api/v1/tareas", params={"completada": False}).json()
    assert len(pendientes) == 1

    # Completar: setea fecha_completada.
    hecha = client.patch(f"/api/v1/tareas/{creada['id']}", json={"completada": True}).json()
    assert hecha["completada"] is True
    assert hecha["fecha_completada"] is not None

    assert client.get("/api/v1/tareas", params={"completada": False}).json() == []
    assert len(client.get("/api/v1/tareas", params={"completada": True}).json()) == 1


def test_tareas_son_privadas_por_usuario(client: TestClient) -> None:
    # Una tarea de OTRO usuario no aparece ni se puede tocar.
    with TestingSessionLocal() as db:
        db.add(Tarea(id=99, usuario_id=2, titulo="Ajena"))
        db.commit()

    assert client.get("/api/v1/tareas").json() == []
    assert client.patch("/api/v1/tareas/99", json={"completada": True}).status_code == 404
    assert client.delete("/api/v1/tareas/99").status_code == 404


def test_eliminar_tarea(client: TestClient) -> None:
    tid = client.post("/api/v1/tareas", json={"titulo": "Borrar"}).json()["id"]
    assert client.delete(f"/api/v1/tareas/{tid}").status_code == 204
    assert client.get("/api/v1/tareas").json() == []


def test_recordatorio_dispara_notificacion_y_no_repite(client: TestClient) -> None:
    from datetime import datetime, timedelta, timezone

    from sqlalchemy import func, select

    from app.services.seguimiento import disparar_recordatorios

    # Tarea con recordatorio ya vencido.
    with TestingSessionLocal() as db:
        db.add(
            Tarea(
                id=5,
                usuario_id=1,
                titulo="Llamar al cliente",
                recordatorio=datetime.now(timezone.utc) - timedelta(minutes=1),
            )
        )
        db.commit()

        assert disparar_recordatorios(db) == 1
        assert db.scalar(select(func.count()).select_from(Notificacion)) == 1
        # No vuelve a disparar el mismo recordatorio.
        assert disparar_recordatorios(db) == 0
        assert db.scalar(select(func.count()).select_from(Notificacion)) == 1
