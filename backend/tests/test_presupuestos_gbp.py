"""Tests de la carga de presupuestos en GBP (sobre el Presupuesto del CRM)."""

from collections.abc import Iterator
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.deps import get_current_user
from app.config import get_settings
from app.db.base import Base
from app.db.models.clientes import Cliente
from app.db.models.oportunidades import Oportunidad
from app.db.models.presupuesto_items import PresupuestoItem
from app.db.models.presupuestos import Presupuesto
from app.db.models.productos import Producto
from app.db.models.usuarios import Usuario
from app.db.session import get_db

TOKEN = "bot-token-test"
BOT_HEADERS = {"X-Bot-Token": TOKEN}

engine = create_engine(
    "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
)
TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


@pytest.fixture()
def client(tmp_path) -> Iterator[TestClient]:  # noqa: ANN001
    from app.main import app

    tables = [
        Usuario.__table__,
        Cliente.__table__,
        Oportunidad.__table__,
        Producto.__table__,
        Presupuesto.__table__,
        PresupuestoItem.__table__,
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
        seed.add(Cliente(id=1, razon_social="BENCEN S.A.", numero_cliente="34923", activo=True))
        seed.commit()

    settings = get_settings()
    settings.GBP_BOT_TOKEN = TOKEN
    settings.MEDIA_DIR = str(tmp_path)
    settings.STORAGE_BACKEND = "local"

    fake_user = Usuario(id=1, email="v@argentinacolor.com", nombre="Vendedor", activo=True)
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = lambda: fake_user
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=engine, tables=tables)


def _payload(**over: object) -> dict:
    base = {
        "cliente_numero": "34923",
        "entrega_por": "Retiro TML - Garin",
        "items": [
            {
                "sku": "NSVC60P",
                "descripcion": "Aspiradora 60W",
                "cantidad": 1,
                "precio_unitario": 36,
            },
            {"descripcion": "Flete", "cantidad": 1, "precio_unitario": 40, "iva": 21},
        ],
    }
    base.update(over)
    return base


def _crear(client: TestClient, **over: object) -> dict:
    r = client.post("/api/v1/presupuestos", json=_payload(**over))
    assert r.status_code == 201, r.text
    return r.json()


def test_crear_standalone_sin_oportunidad(client: TestClient) -> None:
    data = _crear(client)
    assert data["oportunidad_id"] is None
    assert data["cliente_numero"] == "34923"
    assert data["estado_carga"] is None  # todavía NO encolado a GBP


def test_cargar_gbp_encola_y_el_bot_lo_toma(client: TestClient) -> None:
    pid = _crear(client)["id"]
    r = client.post(f"/api/v1/presupuestos/{pid}/cargar-gbp")
    assert r.status_code == 200, r.text
    assert r.json()["estado_carga"] == "pendiente"

    job = client.get("/api/v1/gbp-bot/jobs/next", headers=BOT_HEADERS)
    assert job.status_code == 200, job.text
    j = job.json()
    assert j["id"] == pid
    assert j["cliente_numero"] == "34923"
    assert j["documento"] == "Presupuesto USD"
    assert j["items"][0]["tipo"] == "normal"
    assert j["items"][0]["iva"] is None  # el normal lo trae el SKU
    assert j["items"][1]["tipo"] == "manual"
    assert Decimal(j["items"][1]["iva"]) == 21

    # ya en_proceso -> no vuelve a salir
    assert client.get("/api/v1/gbp-bot/jobs/next", headers=BOT_HEADERS).status_code == 204


def test_next_sin_pendientes_da_204(client: TestClient) -> None:
    _crear(client)  # creado pero NO cargado a GBP -> no está en la cola
    assert client.get("/api/v1/gbp-bot/jobs/next", headers=BOT_HEADERS).status_code == 204


def test_token_invalido_403(client: TestClient) -> None:
    assert client.get("/api/v1/gbp-bot/jobs/next").status_code == 403
    assert client.get(
        "/api/v1/gbp-bot/jobs/next", headers={"X-Bot-Token": "mal"}
    ).status_code == 403


def test_resultado_sube_pdf_y_sirve_el_de_gbp(client: TestClient) -> None:
    pid = _crear(client)["id"]
    client.post(f"/api/v1/presupuestos/{pid}/cargar-gbp")
    client.get("/api/v1/gbp-bot/jobs/next", headers=BOT_HEADERS)

    r = client.post(
        f"/api/v1/gbp-bot/jobs/{pid}/resultado",
        headers=BOT_HEADERS,
        data={"numero_gbp": "P-0001"},
        files={"pdf": ("p.pdf", b"%PDF-1.4 contenido", "application/pdf")},
    )
    assert r.status_code == 200, r.text
    assert r.json()["estado_carga"] == "cargado"
    assert r.json()["id_gbp_pedido"] == "P-0001"

    # el PDF que sirve el CRM ahora es el oficial de GBP
    pdf = client.get(f"/api/v1/presupuestos/{pid}/pdf")
    assert pdf.status_code == 200
    assert pdf.content == b"%PDF-1.4 contenido"


def test_resultado_rechaza_no_pdf(client: TestClient) -> None:
    pid = _crear(client)["id"]
    client.post(f"/api/v1/presupuestos/{pid}/cargar-gbp")
    r = client.post(
        f"/api/v1/gbp-bot/jobs/{pid}/resultado",
        headers=BOT_HEADERS,
        data={"numero_gbp": "P-0002"},
        files={"pdf": ("p.pdf", b"no soy un pdf", "application/pdf")},
    )
    assert r.status_code == 400


def test_error_marca_error(client: TestClient) -> None:
    pid = _crear(client)["id"]
    client.post(f"/api/v1/presupuestos/{pid}/cargar-gbp")
    r = client.post(
        f"/api/v1/gbp-bot/jobs/{pid}/error",
        headers=BOT_HEADERS,
        json={"mensaje": "SKU NSVC60P no existe en GBP"},
    )
    assert r.status_code == 200
    assert r.json()["estado_carga"] == "error"


def test_cargar_sin_cliente_es_400(client: TestClient) -> None:
    pid = _crear(client, cliente_numero=None)["id"]
    r = client.post(f"/api/v1/presupuestos/{pid}/cargar-gbp")
    assert r.status_code == 400
    assert "cliente" in r.json()["detail"].lower()


def test_cargar_manual_sin_iva_es_400(client: TestClient) -> None:
    pid = _crear(
        client,
        items=[{"descripcion": "Flete", "cantidad": 1, "precio_unitario": 40}],  # manual sin IVA
    )["id"]
    r = client.post(f"/api/v1/presupuestos/{pid}/cargar-gbp")
    assert r.status_code == 400
    assert "iva" in r.json()["detail"].lower()


def _items(n: int) -> list[dict]:
    return [
        {"sku": f"S{i}", "descripcion": f"item {i}", "cantidad": 1, "precio_unitario": 10}
        for i in range(n)
    ]


def test_lote_parte_en_tandas_de_20(client: TestClient) -> None:
    body = {"cliente_numero": "34923", "entrega_por": "Retiro TML - Garin", "items": _items(45)}
    r = client.post("/api/v1/presupuestos/lote", json=body)
    assert r.status_code == 201, r.text
    partes = r.json()
    assert len(partes) == 3  # 20 + 20 + 5
    assert [p["gbp_parte"] for p in partes] == [1, 2, 3]
    grupos = {p["gbp_grupo"] for p in partes}
    assert len(grupos) == 1 and None not in grupos
    assert len(partes[0]["items"]) == 20
    assert len(partes[2]["items"]) == 5


def test_lote_chico_no_agrupa(client: TestClient) -> None:
    r = client.post("/api/v1/presupuestos/lote", json=_payload())  # 2 ítems
    assert r.status_code == 201
    partes = r.json()
    assert len(partes) == 1
    assert partes[0]["gbp_grupo"] is None


def test_cargar_grupo_encola_todas_las_partes(client: TestClient) -> None:
    body = {"cliente_numero": "34923", "entrega_por": "Retiro TML - Garin", "items": _items(45)}
    partes = client.post("/api/v1/presupuestos/lote", json=body).json()
    grupo = partes[0]["gbp_grupo"]
    r = client.post(f"/api/v1/presupuestos/grupo/{grupo}/cargar-gbp")
    assert r.status_code == 200
    assert all(p["estado_carga"] == "pendiente" for p in r.json())
    # el bot ahora ve 3 jobs (uno por parte)
    for _ in range(3):
        assert client.get("/api/v1/gbp-bot/jobs/next", headers=BOT_HEADERS).status_code == 200
    assert client.get("/api/v1/gbp-bot/jobs/next", headers=BOT_HEADERS).status_code == 204


def _xlsx_bytes(rows: list[list]) -> bytes:
    from io import BytesIO

    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    for r in rows:
        ws.append(r)
    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


_HDR = ["SKU", "Descripción", "Part Number", "Cantidad", "Precio", "Moneda", "IVA %"]


def _subir_excel(client: TestClient, rows: list[list]):  # noqa: ANN202
    return client.post(
        "/api/v1/presupuestos/importar-lote",
        data={
            "cliente_numero": "34923",
            "entrega_por": "Retiro TML - Garin",
            "documento": "Presupuesto USD",
            "sucursal": "1",
        },
        files={
            "archivo": (
                "p.xlsx",
                _xlsx_bytes(rows),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )


def test_importar_lote_crea_y_el_job_trae_lote(client: TestClient) -> None:
    rows = [_HDR] + [[f"SK{i:03d}", f"item {i}", None, 1, 10, "USD", 0.21] for i in range(25)]
    r = _subir_excel(client, rows)
    assert r.status_code == 201, r.text
    partes = r.json()
    assert len(partes) == 2  # 20 + 5
    client.post(f"/api/v1/presupuestos/grupo/{partes[0]['gbp_grupo']}/cargar-gbp")
    job = client.get("/api/v1/gbp-bot/jobs/next", headers=BOT_HEADERS).json()
    assert job["total_partes"] == 2 and job["parte"] in (1, 2)
    assert job["sucursal"] == "1" and job["documento"] == "Presupuesto USD"
    assert isinstance(job["lote_id"], int)


def test_importar_lote_errores_422_no_crea(client: TestClient) -> None:
    rows = [_HDR, [None, "", None, 0, -5, "EUR", 0.3]]  # fila 2: todo mal
    r = _subir_excel(client, rows)
    assert r.status_code == 422
    assert r.json()["detail"]["errores"][0]["fila"] == 2
    # no se creó nada
    assert client.get("/api/v1/gbp-bot/jobs/next", headers=BOT_HEADERS).status_code == 204


def test_importar_lote_rechaza_costo(client: TestClient) -> None:
    rows = [["SKU", "Descripción", "Cantidad", "Costo", "Moneda", "IVA %"],
            ["X", "y", 1, 10, "USD", 0.21]]
    r = _subir_excel(client, rows)
    assert r.status_code == 400
    assert "Costo" in r.json()["detail"]


def test_error_dry_run_y_guardado(client: TestClient) -> None:
    pid = _crear(client)["id"]
    client.post(f"/api/v1/presupuestos/{pid}/cargar-gbp")
    client.get("/api/v1/gbp-bot/jobs/next", headers=BOT_HEADERS)
    r = client.post(
        f"/api/v1/gbp-bot/jobs/{pid}/error",
        headers=BOT_HEADERS,
        json={"mensaje": "DRY-RUN: todo OK, no se guardó"},
    )
    assert r.json()["estado_carga"] == "prueba"

    pid2 = _crear(client)["id"]
    client.post(f"/api/v1/presupuestos/{pid2}/cargar-gbp")
    client.get("/api/v1/gbp-bot/jobs/next", headers=BOT_HEADERS)
    r2 = client.post(
        f"/api/v1/gbp-bot/jobs/{pid2}/error",
        headers=BOT_HEADERS,
        json={"mensaje": "Timeout; el pedido pudo haber quedado GUARDADO en GBP"},
    )
    assert r2.json()["estado_carga"] == "revisar"


def test_reencolar_cargado_409_y_revisar_requiere_confirmar(client: TestClient) -> None:
    # cargado -> 409
    pid = _crear(client)["id"]
    client.post(f"/api/v1/presupuestos/{pid}/cargar-gbp")
    client.get("/api/v1/gbp-bot/jobs/next", headers=BOT_HEADERS)
    client.post(
        f"/api/v1/gbp-bot/jobs/{pid}/resultado",
        headers=BOT_HEADERS,
        data={"numero_gbp": "#1-1"},
        files={"pdf": ("p.pdf", b"%PDF-1.4 x", "application/pdf")},
    )
    assert client.post(f"/api/v1/presupuestos/{pid}/cargar-gbp").status_code == 409

    # revisar -> 409 sin confirmar, 200 con confirmar
    pid2 = _crear(client)["id"]
    client.post(f"/api/v1/presupuestos/{pid2}/cargar-gbp")
    client.get("/api/v1/gbp-bot/jobs/next", headers=BOT_HEADERS)
    client.post(
        f"/api/v1/gbp-bot/jobs/{pid2}/error",
        headers=BOT_HEADERS,
        json={"mensaje": "pudo haber quedado GUARDADO"},
    )
    assert client.post(f"/api/v1/presupuestos/{pid2}/cargar-gbp").status_code == 409
    assert client.post(
        f"/api/v1/presupuestos/{pid2}/cargar-gbp?confirmar=true"
    ).status_code == 200


def test_standalone_aparece_en_listado_con_filtro_de_seccion(client: TestClient) -> None:
    # Un presupuesto standalone (sin oportunidad) tiene que verse aunque el listado
    # filtre por sección/ámbito (si no, no se puede encolar ni seguir).
    pid = _crear(client)["id"]
    r = client.get("/api/v1/presupuestos?ambito=corporativo")
    assert r.status_code == 200, r.text
    assert pid in [p["id"] for p in r.json()]


def test_job_colgado_se_recicla(client: TestClient) -> None:
    pid = _crear(client)["id"]
    client.post(f"/api/v1/presupuestos/{pid}/cargar-gbp")
    client.get("/api/v1/gbp-bot/jobs/next", headers=BOT_HEADERS)  # queda en_proceso

    with TestingSessionLocal() as db:
        p = db.get(Presupuesto, pid)
        p.gbp_tomado_en = datetime.now(timezone.utc) - timedelta(hours=1)
        db.commit()

    r = client.get("/api/v1/gbp-bot/jobs/next", headers=BOT_HEADERS)
    assert r.status_code == 200
    assert r.json()["id"] == pid
