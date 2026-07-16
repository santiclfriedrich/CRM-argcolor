"""Tests del cierre del loop de Compras: envío real, parseo IA y presupuesto."""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.deps import get_ai, get_current_user, get_user_gmail
from app.db.base import Base
from app.db.models.clientes import Cliente
from app.db.models.configuracion import Configuracion
from app.db.models.mails import DireccionMail, Mail
from app.db.models.oportunidades import EstadoOportunidad, Oportunidad
from app.db.models.presupuesto_items import PresupuestoItem
from app.db.models.presupuestos import Presupuesto
from app.db.models.productos import Producto
from app.db.models.respuestas_compras import RespuestaCompras
from app.db.models.solicitudes_compras import SolicitudCompras
from app.db.models.usuarios import Usuario
from app.db.session import get_db
from app.integrations.ai.base import AIProvider, QuoteDraft, QuoteItem
from app.main import app

engine = create_engine(
    "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
)
TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class FakeAI(AIProvider):
    def extract_email_data(self, email_text, images=None):  # noqa: ANN001
        raise NotImplementedError

    def draft_quote(self, compras_response: str) -> QuoteDraft:
        return QuoteDraft(
            items=[
                QuoteItem(descripcion="Pigmento rojo", cantidad=10, precio_unitario=120.5,
                          fabricante="BASF", sku="PR-100"),
                QuoteItem(descripcion="Solvente", cantidad=2, precio_unitario=50),
            ],
            notas="Entrega en 10 días.",
        )

    def summarize_thread(self, messages):  # noqa: ANN001
        return ""


class FakeGmail:
    def __init__(self) -> None:
        self.enviado: dict | None = None

    def send_message(self, to, subject, body, thread_id=None, in_reply_to=None, cc=None, attachments=None):  # noqa: ANN001, E501
        self.enviado = {
            "to": to,
            "subject": subject,
            "cc": cc,
            "thread_id": thread_id,
            "attachments": attachments,
        }
        return {"message_id": "m-1", "thread_id": "hilo-compras"}


_fake_gmail = FakeGmail()


@pytest.fixture()
def client() -> Iterator[TestClient]:
    tables = [
        Usuario.__table__,
        Cliente.__table__,
        Oportunidad.__table__,
        SolicitudCompras.__table__,
        RespuestaCompras.__table__,
        Producto.__table__,
        Presupuesto.__table__,
        PresupuestoItem.__table__,
        Mail.__table__,
        Configuracion.__table__,
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
        seed.add(Cliente(id=1, razon_social="BENCEN S.A.", activo=True))
        seed.add(Oportunidad(id=1, cliente_id=1, vendedor_id=1, estado=EstadoOportunidad.nueva))
        seed.add(
            SolicitudCompras(
                id=1, oportunidad_id=1, solicitante_id=1, requerimiento="10 kg pigmento rojo"
            )
        )
        seed.add(
            Configuracion(
                clave="solicitudes_compras",
                valor={"to": "compras@argentinacolor.com", "cc": ["jefe@argentinacolor.com"]},
            )
        )
        seed.commit()

    _fake_gmail.enviado = None
    fake_user = Usuario(id=1, email="v@argentinacolor.com", nombre="Vendedor", activo=True)
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = lambda: fake_user
    app.dependency_overrides[get_ai] = lambda: FakeAI()
    app.dependency_overrides[get_user_gmail] = lambda: _fake_gmail
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=engine, tables=tables)


def test_enviar_solicitud_manda_por_gmail_y_guarda_hilo(client: TestClient) -> None:
    resp = client.post("/api/v1/solicitudes/1/enviar")
    assert resp.status_code == 200
    assert resp.json()["gmail_thread_id"] == "hilo-compras"
    # Fue al destinatario configurado, con CC.
    assert _fake_gmail.enviado["to"] == "compras@argentinacolor.com"
    assert _fake_gmail.enviado["cc"] == ["jefe@argentinacolor.com"]


def test_adjuntos_se_envian_a_compras(client: TestClient, tmp_path, monkeypatch) -> None:  # noqa: ANN001
    monkeypatch.setattr("app.config.settings.MEDIA_DIR", str(tmp_path))
    # El cliente mandó un PDF con los productos: lo adjuntamos a la solicitud.
    resp = client.post(
        "/api/v1/solicitudes/1/adjuntos",
        files=[("files", ("productos.pdf", b"%PDF-fake", "application/pdf"))],
    )
    assert resp.status_code == 200
    assert len(resp.json()["archivos_adjuntos"]) == 1

    # Al enviar a Compras, el adjunto viaja en el mail.
    client.post("/api/v1/solicitudes/1/enviar")
    att = _fake_gmail.enviado["attachments"]
    assert att and att[0]["filename"] == "productos.pdf"
    assert att[0]["mime"] == "application/pdf"
    assert att[0]["content"] == b"%PDF-fake"


def test_cargar_respuesta_parsea_con_ia(client: TestClient) -> None:
    resp = client.post(
        "/api/v1/solicitudes/1/respuesta",
        json={"contenido": "Pigmento rojo 10u $120.50 - Solvente 2u $50"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert len(data["datos_parseados_ia"]["items"]) == 2
    assert data["datos_parseados_ia"]["items"][0]["descripcion"] == "Pigmento rojo"
    assert data["notas_compras"] == "Entrega en 10 días."

    # La solicitud quedó como respondida.
    det = client.get("/api/v1/solicitudes/1").json()
    assert det["estado"] == "respondida"
    assert len(det["respuestas"]) == 1


def test_presupuesto_desde_solicitud_prellena_items(client: TestClient) -> None:
    client.post(
        "/api/v1/solicitudes/1/respuesta",
        json={"contenido": "tabla de precios"},
    )
    resp = client.post("/api/v1/presupuestos/desde-solicitud/1")
    assert resp.status_code == 201
    data = resp.json()

    # Se armó con los ítems parseados (10*120.5 + 2*50 = 1305).
    assert len(data["items"]) == 2
    assert float(data["monto_total"]) == 1305.0
    assert data["items"][0]["fabricante"] == "BASF"

    # La oportunidad avanzó a presupuestada.
    op = client.get("/api/v1/oportunidades/1").json()
    assert op["estado"] == "presupuestada"


def test_desde_solicitud_sin_respuesta_da_400(client: TestClient) -> None:
    resp = client.post("/api/v1/presupuestos/desde-solicitud/1")
    assert resp.status_code == 400


def test_sugerencia_compras_arma_requerimiento_desde_mail(client: TestClient) -> None:
    with TestingSessionLocal() as db:
        db.add(
            Mail(
                oportunidad_id=1,
                direccion=DireccionMail.entrante,
                de="juan@bencen.com.ar",
                cuerpo="Hola, necesito...",
                datos_extraidos_ia={
                    "producto": "Pigmento rojo",
                    "cantidad": "100 kg",
                    "requerimiento": "Para una obra en La Plata",
                    "plazo": "2 semanas",
                },
            )
        )
        db.commit()

    resp = client.get("/api/v1/oportunidades/1/sugerencia-compras")
    assert resp.status_code == 200
    req = resp.json()["requerimiento"]
    assert "Pigmento rojo" in req
    assert "100 kg" in req
    assert "Para una obra en La Plata" in req


def test_sugerencia_compras_vacia_si_no_hay_mail(client: TestClient) -> None:
    resp = client.get("/api/v1/oportunidades/1/sugerencia-compras")
    assert resp.status_code == 200
    assert resp.json()["requerimiento"] == ""
