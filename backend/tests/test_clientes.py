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
from app.db.models.adjuntos import Adjunto
from app.db.models.clientes import Cliente
from app.db.models.contactos_cliente import ContactoCliente
from app.db.models.dominios_cliente import DominioCliente
from app.db.models.mails import Mail
from app.db.models.mails_descartados import MailDescartado
from app.db.models.oportunidades import Oportunidad
from app.db.models.presupuesto_items import PresupuestoItem
from app.db.models.presupuestos import Presupuesto
from app.db.models.recordatorios import Recordatorio
from app.db.models.respuestas_compras import RespuestaCompras
from app.db.models.solicitudes_compras import SolicitudCompras
from app.db.models.tareas import Tarea
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
        Oportunidad.__table__,
        Mail.__table__,
        MailDescartado.__table__,
        SolicitudCompras.__table__,
        RespuestaCompras.__table__,
        Presupuesto.__table__,
        PresupuestoItem.__table__,
        Recordatorio.__table__,
        Adjunto.__table__,
        Tarea.__table__,
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
    # El CUIT se guarda normalizado a formato canónico XX-XXXXXXXX-X.
    resp = client.post(
        "/api/v1/clientes", json={"razon_social": "BENCEN S.A.", "cuit": "30586999512"}
    )
    assert resp.status_code == 201
    cliente_id = resp.json()["id"]
    assert resp.json()["cuit"] == "30-58699951-2"

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
    cliente_id = client.post(
        "/api/v1/clientes", json={"razon_social": "ACME", "cuit": "20-11111111-1"}
    ).json()["id"]

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
    cliente_id = client.post(
        "/api/v1/clientes", json={"razon_social": "BENCEN", "cuit": "20-22222222-2"}
    ).json()["id"]

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
    a = client.post(
        "/api/v1/clientes", json={"razon_social": "A", "cuit": "20-33333333-3"}
    ).json()["id"]
    b = client.post(
        "/api/v1/clientes", json={"razon_social": "B", "cuit": "20-44444444-4"}
    ).json()["id"]
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


def test_delete_cliente_cascada(client: TestClient) -> None:
    from sqlalchemy import func, select

    cid = client.post(
        "/api/v1/clientes", json={"razon_social": "ACME", "cuit": "20-55555555-5"}
    ).json()["id"]
    with TestingSessionLocal() as db:
        db.add(ContactoCliente(cliente_id=cid, nombre="Juan"))
        db.add(DominioCliente(cliente_id=cid, dominio="acme.com"))
        db.add(Oportunidad(id=1, cliente_id=cid))
        db.add(Tarea(id=1, usuario_id=1, titulo="Llamar", cliente_id=cid))
        db.commit()

    assert client.delete(f"/api/v1/clientes/{cid}").status_code == 204

    with TestingSessionLocal() as db:
        assert db.get(Cliente, cid) is None
        assert db.scalar(select(func.count()).select_from(Oportunidad)) == 0
        assert db.scalar(select(func.count()).select_from(ContactoCliente)) == 0
        assert db.scalar(select(func.count()).select_from(DominioCliente)) == 0
        # La tarea NO se borra: queda desvinculada del cliente.
        tarea = db.get(Tarea, 1)
        assert tarea is not None and tarea.cliente_id is None


def test_cuenta_principal_y_subcuentas(client: TestClient) -> None:
    padre = client.post(
        "/api/v1/clientes", json={"razon_social": "Grupo Madre", "cuit": "20-66666666-6"}
    ).json()["id"]
    hija = client.post(
        "/api/v1/clientes",
        json={
            "razon_social": "Sucursal Norte",
            "cuit": "20-77777777-7",
            "cuenta_principal_id": padre,
            "tipo": "cliente",
        },
    )
    assert hija.status_code == 201
    hija_id = hija.json()["id"]

    # La hija muestra su cuenta principal.
    det_hija = client.get(f"/api/v1/clientes/{hija_id}").json()
    assert det_hija["cuenta_principal"]["razon_social"] == "Grupo Madre"
    assert det_hija["tipo"] == "cliente"

    # El padre lista sus subcuentas.
    det_padre = client.get(f"/api/v1/clientes/{padre}").json()
    assert any(s["id"] == hija_id for s in det_padre["subcuentas"])


def test_cuenta_no_puede_ser_su_propia_principal(client: TestClient) -> None:
    cid = client.post(
        "/api/v1/clientes", json={"razon_social": "Sola", "cuit": "20-88888888-8"}
    ).json()["id"]
    resp = client.patch(f"/api/v1/clientes/{cid}", json={"cuenta_principal_id": cid})
    assert resp.status_code == 400


def test_cuit_obligatorio_formato_y_unico(client: TestClient) -> None:
    # Obligatorio: sin CUIT -> 422.
    assert client.post("/api/v1/clientes", json={"razon_social": "X"}).status_code == 422
    # Formato: menos de 11 dígitos -> 422.
    assert (
        client.post("/api/v1/clientes", json={"razon_social": "X", "cuit": "30-111-2"}).status_code
        == 422
    )
    # Alta válida.
    r = client.post("/api/v1/clientes", json={"razon_social": "X", "cuit": "30-58699951-2"})
    assert r.status_code == 201
    # Duplicado (mismo número, distinto formato) -> 409.
    dup = client.post("/api/v1/clientes", json={"razon_social": "Y", "cuit": "30586999512"})
    assert dup.status_code == 409
    assert "30-58699951-2" in dup.json()["detail"]
