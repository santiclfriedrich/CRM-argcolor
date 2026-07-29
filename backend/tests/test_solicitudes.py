"""Tests del formulario interno a Compras (SQLite en memoria, sin login real)."""

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
from app.db.models.configuracion import Configuracion
from app.db.models.contactos_cliente import ContactoCliente
from app.db.models.grupos_compras import GrupoCompras
from app.db.models.mails import Mail
from app.db.models.oportunidades import Oportunidad
from app.db.models.respuestas_compras import RespuestaCompras
from app.db.models.solicitudes_compras import SolicitudCompras
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
        SolicitudCompras.__table__,
        RespuestaCompras.__table__,
        Configuracion.__table__,
        GrupoCompras.__table__,
        Mail.__table__,
        Adjunto.__table__,
    ]
    Base.metadata.create_all(bind=engine, tables=tables)

    def override_get_db() -> Iterator[Session]:
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    with TestingSessionLocal() as seed:
        seed.add(Usuario(id=1, email="v@argentinacolor.com", nombre="Vendedor Uno", activo=True))
        seed.add(Cliente(id=1, razon_social="BENCEN S.A.", activo=True))
        seed.add(Oportunidad(id=1, cliente_id=1, vendedor_id=1))
        seed.add(
            Configuracion(
                clave="solicitudes_compras",
                valor={"to": "carlos@argentinacolor.com", "cc": ["marcos@argentinacolor.com"]},
            )
        )
        seed.commit()

    fake_user = Usuario(id=1, email="v@argentinacolor.com", nombre="Vendedor Uno", activo=True)

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = lambda: fake_user
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=engine, tables=tables)


def test_create_mueve_oportunidad_a_en_compras(client: TestClient) -> None:
    resp = client.post(
        "/api/v1/solicitudes",
        json={
            "oportunidad_id": 1,
            "requerimiento": "100 kg de pigmento rojo",
            "condicion_pago": "30",
            "importe_aproximado": 1500.5,
            "ccs_extra": ["extra@cliente.com"],
        },
    )
    assert resp.status_code == 201
    creada = resp.json()
    assert creada["estado"] == "enviada"
    assert creada["solicitante"]["nombre"] == "Vendedor Uno"
    assert creada["oportunidad"]["cliente"]["razon_social"] == "BENCEN S.A."

    # Efecto colateral: la oportunidad pasó a en_compras.
    op = client.get("/api/v1/oportunidades/1").json()
    assert op["estado"] == "en_compras"


def test_adjuntos_de_oportunidad_se_copian_a_la_solicitud(client: TestClient) -> None:
    from app.services.storage import get_storage

    # Simulamos un archivo ya adjunto a la oportunidad (subido).
    key = "oportunidades/1/0_plano.pdf"
    get_storage().put(key, b"%PDF-1.4 plano", "application/pdf")
    with TestingSessionLocal() as db:
        op = db.get(Oportunidad, 1)
        op.archivos_adjuntos = [
            {"id": 1, "filename": "plano.pdf", "mime_type": "application/pdf", "path": key}
        ]
        db.commit()

    # Aparece en la lista de adjuntos para Compras.
    disponibles = client.get("/api/v1/oportunidades/1/adjuntos-compras").json()
    assert any(a["ref"] == "op:1" and a["filename"] == "plano.pdf" for a in disponibles)

    # Al crear la solicitud incluyéndolo, se copia a la solicitud.
    sid = client.post(
        "/api/v1/solicitudes",
        json={
            "oportunidad_id": 1,
            "requerimiento": "Cotizar según plano",
            "adjuntos_oportunidad": ["op:1"],
        },
    ).json()["id"]

    with TestingSessionLocal() as db:
        sol = db.get(SolicitudCompras, sid)
        nombres = [m["filename"] for m in (sol.archivos_adjuntos or [])]
        assert "plano.pdf" in nombres

    # Una ref inexistente no rompe la creación (se ignora).
    r = client.post(
        "/api/v1/solicitudes",
        json={"oportunidad_id": 1, "requerimiento": "x", "adjuntos_oportunidad": ["op:999"]},
    )
    assert r.status_code == 201


def test_email_preview_arma_asunto_y_cc(client: TestClient) -> None:
    sid = client.post(
        "/api/v1/solicitudes",
        json={
            "oportunidad_id": 1,
            "requerimiento": "Cotizar tambores",
            "ccs_extra": ["extra@cliente.com"],
        },
    ).json()["id"]

    detail = client.get(f"/api/v1/solicitudes/{sid}").json()
    preview = detail["email_preview"]
    assert preview["to"] == "carlos@argentinacolor.com"
    # CC = default de configuracion + ccs_extra de la solicitud.
    assert "marcos@argentinacolor.com" in preview["cc"]
    assert "extra@cliente.com" in preview["cc"]
    assert preview["subject"] == "Solicitud Vendedor Uno: BENCEN S.A. - ID 1"
    assert "Cotizar tambores" in preview["body"]


def test_patch_respondida_setea_fecha_respuesta(client: TestClient) -> None:
    sid = client.post(
        "/api/v1/solicitudes",
        json={"oportunidad_id": 1, "requerimiento": "x"},
    ).json()["id"]

    resp = client.patch(f"/api/v1/solicitudes/{sid}", json={"estado": "respondida"})
    assert resp.status_code == 200
    assert resp.json()["estado"] == "respondida"
    assert resp.json()["fecha_respuesta"] is not None


def test_create_404_oportunidad_inexistente(client: TestClient) -> None:
    resp = client.post(
        "/api/v1/solicitudes",
        json={"oportunidad_id": 999, "requerimiento": "x"},
    )
    assert resp.status_code == 404
