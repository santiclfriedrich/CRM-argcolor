"""Tests de las etiquetas de la bandeja (CRUD + aplicar a mails), vía API."""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.deps import get_current_user
from app.db.base import Base
from app.db.models.etiquetas_mail import EtiquetaMail, mail_etiquetas
from app.db.models.mails import DireccionMail, Mail
from app.db.models.mails_descartados import MailDescartado
from app.db.models.usuarios import Usuario
from app.db.session import get_db
from app.main import app

engine = create_engine(
    "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
)
TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

_TABLES = [
    Usuario.__table__,
    Mail.__table__,
    MailDescartado.__table__,
    EtiquetaMail.__table__,
    mail_etiquetas,
]


@pytest.fixture()
def client() -> Iterator[TestClient]:
    Base.metadata.create_all(bind=engine, tables=_TABLES)

    def override_get_db() -> Iterator[Session]:
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    with TestingSessionLocal() as seed:
        seed.add(Usuario(id=1, email="v@argentinacolor.com", nombre="Vendedor", activo=True))
        seed.add(Usuario(id=2, email="otro@argentinacolor.com", nombre="Otro", activo=True))
        seed.add(
            Mail(
                id=10,
                usuario_id=1,
                direccion=DireccionMail.entrante,
                asunto="Consulta",
                carpeta="entrada",
                cuerpo="hola",
            )
        )
        seed.commit()

    fake_user = Usuario(id=1, email="v@argentinacolor.com", nombre="Vendedor", activo=True)
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = lambda: fake_user
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=engine, tables=_TABLES)


def test_crud_etiquetas_y_nombre_unico(client: TestClient) -> None:
    r = client.post("/api/v1/mails/etiquetas", json={"nombre": "Compras", "color": "#dc2626"})
    assert r.status_code == 201
    etq = r.json()
    assert etq["nombre"] == "Compras"
    assert etq["color"] == "#dc2626"

    # Nombre repetido (case-insensitive) -> 409.
    dup = client.post("/api/v1/mails/etiquetas", json={"nombre": "compras"})
    assert dup.status_code == 409

    # Listado.
    lista = client.get("/api/v1/mails/etiquetas").json()
    assert [e["nombre"] for e in lista] == ["Compras"]

    # Renombrar + recolorear.
    upd = client.patch(
        f"/api/v1/mails/etiquetas/{etq['id']}", json={"nombre": "Urgente", "color": "#16a34a"}
    )
    assert upd.status_code == 200
    assert upd.json()["nombre"] == "Urgente"

    # Borrar.
    assert client.delete(f"/api/v1/mails/etiquetas/{etq['id']}").status_code == 204
    assert client.get("/api/v1/mails/etiquetas").json() == []


def test_aplicar_y_quitar_etiqueta_aparece_en_inbox(client: TestClient) -> None:
    etq_id = client.post("/api/v1/mails/etiquetas", json={"nombre": "Pendiente"}).json()["id"]

    # Aplicar al mail 10.
    r = client.post(
        "/api/v1/mails/etiquetas/aplicar",
        json={"etiqueta_id": etq_id, "mail_ids": [10], "aplicar": True},
    )
    assert r.status_code == 204

    fila = next(m for m in client.get("/api/v1/mails/inbox").json() if m["id"] == 10)
    assert [e["nombre"] for e in fila["etiquetas"]] == ["Pendiente"]

    # Quitar.
    client.post(
        "/api/v1/mails/etiquetas/aplicar",
        json={"etiqueta_id": etq_id, "mail_ids": [10], "aplicar": False},
    )
    fila = next(m for m in client.get("/api/v1/mails/inbox").json() if m["id"] == 10)
    assert fila["etiquetas"] == []


def test_no_toca_etiqueta_de_otro_usuario(client: TestClient) -> None:
    # Etiqueta sembrada a mano para el usuario 2.
    with TestingSessionLocal() as db:
        db.add(EtiquetaMail(id=99, usuario_id=2, nombre="Ajena", color="#000000"))
        db.commit()

    assert client.patch("/api/v1/mails/etiquetas/99", json={"nombre": "x"}).status_code == 404
    assert client.delete("/api/v1/mails/etiquetas/99").status_code == 404
    # No figura en el listado del usuario 1.
    assert all(e["id"] != 99 for e in client.get("/api/v1/mails/etiquetas").json())
