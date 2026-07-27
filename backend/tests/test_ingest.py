"""Tests del pipeline de ingesta de mails (Slice 1, con IA fake)."""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.deps import get_ai, get_current_user
from app.db.base import Base
from app.db.models.adjuntos import Adjunto
from app.db.models.clientes import Cliente
from app.db.models.contactos_cliente import ContactoCliente
from app.db.models.dominios_cliente import DominioCliente
from app.db.models.mails import Mail
from app.db.models.mails_descartados import MailDescartado
from app.db.models.oportunidades import Oportunidad
from app.db.models.usuarios import Usuario
from app.db.session import get_db
from app.integrations.ai.base import AIProvider, EmailData
from app.main import app

engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class FakeAI(AIProvider):
    """IA controlable por test: devuelve lo que se le configure."""

    def __init__(self, data: EmailData) -> None:
        self.data = data

    def extract_email_data(self, email_text, image_paths=None, documents=None) -> EmailData:  # noqa: ANN001
        return self.data

    def draft_quote(self, compras_response):  # noqa: ANN001
        raise NotImplementedError

    def summarize_thread(self, messages):  # noqa: ANN001
        return "resumen"


# La IA por defecto en los tests: pedido claro (no requiere aclaración).
_fake = FakeAI(EmailData(producto="Pigmento rojo", cantidad="100 kg", requerimiento="Cotizar"))


@pytest.fixture()
def client() -> Iterator[TestClient]:
    tables = [
        Usuario.__table__,
        Cliente.__table__,
        ContactoCliente.__table__,
        DominioCliente.__table__,
        Oportunidad.__table__,
        Mail.__table__,
        MailDescartado.__table__,
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
        seed.add(Usuario(id=1, email="v@argentinacolor.com", nombre="Vendedor", activo=True))
        seed.add(Cliente(id=1, razon_social="BENCEN S.A.", vendedor_asignado_id=1, activo=True))
        seed.add(DominioCliente(id=1, cliente_id=1, dominio="bencen.com.ar"))
        seed.add(
            ContactoCliente(id=1, cliente_id=1, nombre="Juan", email="juan@bencen.com.ar")
        )
        seed.commit()

    fake_user = Usuario(id=1, email="v@argentinacolor.com", nombre="Vendedor", activo=True)

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = lambda: fake_user
    app.dependency_overrides[get_ai] = lambda: _fake
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=engine, tables=tables)


def test_ingesta_identifica_cliente_y_contacto_por_dominio(client: TestClient) -> None:
    resp = client.post(
        "/api/v1/mails/ingest",
        json={"de": "juan@bencen.com.ar", "asunto": "Pedido", "cuerpo": "Necesito 100kg"},
    )
    assert resp.status_code == 201
    mail = resp.json()["mail"]
    # Identificó cliente (por dominio) y contacto (por email), y heredó el vendedor.
    assert mail["oportunidad"]["cliente"]["razon_social"] == "BENCEN S.A."
    assert mail["datos_extraidos_ia"]["producto"] == "Pigmento rojo"

    op = client.get(f"/api/v1/oportunidades/{mail['oportunidad_id']}").json()
    assert op["estado"] == "nueva"
    assert op["cliente_id"] == 1
    assert op["contacto_cliente_id"] == 1
    assert op["vendedor_id"] == 1
    assert op["fuente"] == "mail"


def test_ingesta_dominio_desconocido_queda_sin_cliente(client: TestClient) -> None:
    resp = client.post(
        "/api/v1/mails/ingest",
        json={"de": "alguien@desconocido.com", "cuerpo": "hola"},
    )
    assert resp.status_code == 201
    op_id = resp.json()["mail"]["oportunidad_id"]
    op = client.get(f"/api/v1/oportunidades/{op_id}").json()
    assert op["cliente_id"] is None  # por identificar
    # Sin cliente asignado, la oportunidad queda a nombre del usuario logueado.
    assert op["vendedor_id"] == 1


def test_ingesta_requiere_aclaracion(client: TestClient) -> None:
    # Cambiamos la IA fake para este test: pedido vago.
    app.dependency_overrides[get_ai] = lambda: FakeAI(
        EmailData(requiere_aclaracion=True, borrador_aclaracion="¿Qué producto necesitás?")
    )
    resp = client.post(
        "/api/v1/mails/ingest",
        json={"de": "juan@bencen.com.ar", "cuerpo": "necesito algo"},
    )
    assert resp.status_code == 201
    op_id = resp.json()["mail"]["oportunidad_id"]
    op = client.get(f"/api/v1/oportunidades/{op_id}").json()
    assert op["estado"] == "requiere_aclaracion"
    assert resp.json()["mail"]["datos_extraidos_ia"]["borrador_aclaracion"]


def test_bandeja_lista_entrantes(client: TestClient) -> None:
    client.post("/api/v1/mails/ingest", json={"de": "juan@bencen.com.ar", "cuerpo": "x"})
    items = client.get("/api/v1/mails").json()
    assert len(items) == 1
    assert items[0]["direccion"] == "entrante"


def test_ingesta_ignora_notificacion_automatica(client: TestClient) -> None:
    from sqlalchemy import func, select

    # Por marcador en el cuerpo (link de baja), aunque diga "cotizar".
    r1 = client.post(
        "/api/v1/mails/ingest",
        json={
            "de": "info@medox.ai",
            "asunto": "Nuevo vencimiento MED #15598",
            "cuerpo": "Te invitamos a realizar tu cotización. Unsubscribe. Copyright Medox",
        },
    )
    assert r1.json()["descartado"] is True
    assert r1.json()["categoria"] == "automatico"

    # Por dominio en la denylist (medox.ai), sin marcadores en el cuerpo.
    r2 = client.post(
        "/api/v1/mails/ingest",
        json={"de": "avisos@medox.ai", "asunto": "Recordatorio", "cuerpo": "Ir a cotizar"},
    )
    assert r2.json()["descartado"] is True

    with TestingSessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(Oportunidad)) == 0
        assert db.scalar(select(func.count()).select_from(Mail)) == 0


def test_ingesta_ignora_proforma_administrativa(client: TestClient) -> None:
    from sqlalchemy import func, select

    r = client.post(
        "/api/v1/mails/ingest",
        json={
            "de": "ascoccia@tmlogistica.com.ar",
            "asunto": "PROFORMA ARGENTINA COLOR JULIO Q1",
            "cuerpo": "Buen día. Adjunto detalle. Saludos.",
        },
    )
    assert r.json()["descartado"] is True
    assert r.json()["categoria"] == "administrativo"
    with TestingSessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(Oportunidad)) == 0


def test_ingesta_ignora_reaccion_de_gmail(client: TestClient) -> None:
    from sqlalchemy import func, select

    r = client.post(
        "/api/v1/mails/ingest",
        json={
            "de": "mamangold@gruporandazzo.com.ar",
            "asunto": "Re: Cotización toner 660",
            "cuerpo": "María Pilar Mangold reaccionó a través de Gmail a tu mensaje",
        },
    )
    assert r.json()["descartado"] is True
    with TestingSessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(Oportunidad)) == 0


def test_ingesta_ignora_hilo_iniciado_por_nosotros(client: TestClient) -> None:
    from sqlalchemy import func, select

    # Un proveedor (Microglobal) responde a un pedido de cotización que originó
    # alguien de @argentinacolor.com: es abastecimiento, NO una oportunidad,
    # aunque el asunto diga "COTIZAR". La raíz del hilo es la casilla propia.
    cuerpo = (
        "Hola, ya fue enviada la solicitud a HP, aguardando precios. Saludos.\n\n"
        "De: Karen Flores <karen.f@argentinacolor.com>\n"
        "Para: Rodriguez Augusto <arodrigu@microglobal.com.ar>\n"
        "Asunto: Re: Proyecto Impresoras OROPLATA - COTIZAR\n\n"
        "Buen dia, adjunto excel con el detalle para cotizar.\n\n"
        "El jue, 23 jul 2026, Rodriguez Augusto (<arodrigu@microglobal.com.ar>) escribió:\n"
        "Buenos dias, copio a Paula por precios.\n\n"
        "De: Diego Ramirez <diego.ramirez@argentinacolor.com>\n"
        "Para: Rodriguez Augusto <arodrigu@microglobal.com.ar>\n"
        "Asunto: Proyecto Impresoras OROPLATA - COTIZAR\n"
        "Pongo en copia a Karen para que me puedan cotizar esta oportunidad."
    )
    r = client.post(
        "/api/v1/mails/ingest",
        json={
            "de": "pdonofri@microglobal.com.ar",
            "asunto": "RE: Proyecto Impresoras OROPLATA - OPD - COTIZAR",
            "cuerpo": cuerpo,
        },
    )
    assert r.json()["descartado"] is True
    assert r.json()["categoria"] == "abastecimiento"
    with TestingSessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(Oportunidad)) == 0


def test_remitente_raiz_formato_bare_y_mailto() -> None:
    # Formato real de Outlook: "De: mail  [mailto:mail]" sin <> en la raíz.
    from app.services.ingest import _remitente_raiz, hilo_iniciado_por_nosotros

    cuerpo = (
        "El jue, Pablo (<ventas4@onlinebct.com <mailto:ventas4@onlinebct.com>>) escribió:\n"
        "Te paso la cotización.\n\n"
        "De: carlos.s@argentinacolor.com <mailto:carlos.s@argentinacolor.com> "
        "[mailto:carlos.s@argentinacolor.com]\n"
        "Asunto: Cotización Baterías Lenovo\n"
        "Buen día, me puedes cotizar estas baterías?"
    )
    assert _remitente_raiz(cuerpo) == "carlos.s@argentinacolor.com"
    assert hilo_iniciado_por_nosotros(cuerpo) is True


def test_ingesta_rfq_lee_planilla_y_guarda_adjuntos(client: TestClient) -> None:
    # Un RFQ cuyo cuerpo solo dice "cotizar la planilla adjunta": la planilla
    # (CSV) debe llegar a la IA como texto y el PDF adjunto como documento, y
    # ambos guardarse como Adjunto.
    from sqlalchemy import func, select

    from app.services.ingest import process_incoming_email

    class CapturaAI(AIProvider):
        def __init__(self) -> None:
            self.texto = ""
            self.docs: list = []

        def extract_email_data(self, email_text, images=None, documents=None) -> EmailData:  # noqa: ANN001
            self.texto = email_text
            self.docs = documents or []
            return EmailData(producto="Termotanque", requerimiento="RFQ")

        def draft_quote(self, compras_response):  # noqa: ANN001
            raise NotImplementedError

        def summarize_thread(self, messages):  # noqa: ANN001
            return ""

    ai = CapturaAI()
    documentos = [
        {"nombre": "items.csv", "mime": "text/csv", "data": b"SKU,Cant\nTT50,3\n"},
        {"nombre": "cond.pdf", "mime": "application/pdf", "data": b"%PDF-1.4 test"},
    ]
    with TestingSessionLocal() as db:
        mail = process_incoming_email(
            db,
            ai,
            de="juan@bencen.com.ar",
            asunto="RFQ / 00059993 / Termotanque",
            cuerpo="Estimado proveedor, cotizar los ítems de la planilla adjunta.",
            documentos=documentos,
        )
        assert mail is not None
        # La planilla se volcó a texto y llegó a la IA.
        assert "Planilla adjunta: items.csv" in ai.texto
        assert "TT50 | 3" in ai.texto
        # El PDF llegó como documento nativo (no como texto).
        assert len(ai.docs) == 1
        assert ai.docs[0].mime_type == "application/pdf"
        # Ambos adjuntos quedaron guardados (imagen 0 + 2 documentos).
        n_adj = db.scalar(
            select(func.count()).select_from(Adjunto).where(Adjunto.mail_id == mail.id)
        )
        assert n_adj == 2


def test_ingesta_hilo_iniciado_por_cliente_si_crea_oportunidad(client: TestClient) -> None:
    from sqlalchemy import func, select

    # Control: un hilo cuya RAÍZ es el cliente (no nosotros) sí genera
    # oportunidad, aunque en el medio haya una respuesta nuestra citada.
    cuerpo = (
        "Perfecto, quedo a la espera del presupuesto. Gracias.\n\n"
        "El jue, 23 jul 2026, Ventas (<ventas@argentinacolor.com>) escribió:\n"
        "Buen dia, recibimos su consulta.\n\n"
        "De: Juan Perez <juan@bencen.com.ar>\n"
        "Para: Ventas <ventas@argentinacolor.com>\n"
        "Asunto: Consulta de compra\n"
        "Necesito cotizar 100 kg de pigmento rojo."
    )
    r = client.post(
        "/api/v1/mails/ingest",
        json={
            "de": "juan@bencen.com.ar",
            "asunto": "Re: Consulta de compra",
            "cuerpo": cuerpo,
        },
    )
    assert r.json().get("descartado") is not True
    with TestingSessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(Oportunidad)) == 1


def test_ingesta_remitente_interno_no_matchea_cliente(client: TestClient) -> None:
    # Aunque exista un DominioCliente 'argentinacolor.com' (dato malo), un mail
    # de un remitente interno NO debe matchear a ese cliente.
    with TestingSessionLocal() as db:
        db.add(DominioCliente(id=99, cliente_id=1, dominio="argentinacolor.com"))
        db.commit()
    r = client.post(
        "/api/v1/mails/ingest",
        json={"de": "matias@argentinacolor.com", "asunto": "Pedido", "cuerpo": "100kg"},
    )
    assert r.json()["mail"]["oportunidad"]["cliente"] is None  # no matcheó al cliente 1


def test_ingesta_ignora_posventa_por_asunto(client: TestClient) -> None:
    from sqlalchemy import func, select

    # "Re: Reclamo" -> posventa, aunque el cuerpo pida una alternativa/reemplazo.
    r = client.post(
        "/api/v1/mails/ingest",
        json={
            "de": "juan@bencen.com.ar",
            "asunto": "Re: Reclamo",
            "cuerpo": "Podrían ofrecernos alguna alternativa con similares características?",
        },
    )
    assert r.json()["descartado"] is True
    assert r.json()["categoria"] == "posventa"
    with TestingSessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(Oportunidad)) == 0


def test_ingesta_ignora_orden_compra_en_frio(client: TestClient) -> None:
    from sqlalchemy import func, select

    # Hilo que llega por primera vez ya con la OC adentro (sin oportunidad
    # previa): es una compra cerrada, no una consulta -> no crea oportunidad.
    r = client.post(
        "/api/v1/mails/ingest",
        json={
            "de": "juan@bencen.com.ar",
            "asunto": "RE: EQUIPO COLABORADOR LUPINACCI OC 29992 ARG COLOR",
            "cuerpo": "Buenas tardes, en adjunto la OC. Saludos.",
        },
    )
    assert r.json()["descartado"] is True
    assert r.json()["categoria"] == "orden_compra"
    with TestingSessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(Oportunidad)) == 0


def test_ingesta_orden_compra_se_adjunta_si_op_existente(client: TestClient) -> None:
    from sqlalchemy import func, select

    # Con una oportunidad ya creada por la consulta inicial, la OC posterior del
    # mismo hilo NO se descarta: se adjunta (el dedup corre antes del filtro OC).
    r1 = client.post(
        "/api/v1/mails/ingest",
        json={"de": "juan@bencen.com.ar", "asunto": "Cotización equipo", "cuerpo": "1 equipo"},
    )
    op1 = r1.json()["mail"]["oportunidad_id"]

    r2 = client.post(
        "/api/v1/mails/ingest",
        json={
            "de": "juan@bencen.com.ar",
            "asunto": "Re: Cotización equipo",
            "cuerpo": "Perfecto, adjunto la orden de compra. Gracias.",
        },
    )
    assert r2.status_code == 201
    assert r2.json().get("descartado") is not True
    assert r2.json()["mail"]["oportunidad_id"] == op1  # se adjuntó, no se descartó

    with TestingSessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(Oportunidad)) == 1


def test_ingesta_deduplica_por_cliente_y_asunto(client: TestClient) -> None:
    from sqlalchemy import func, select

    # Primer mail: crea la oportunidad.
    r1 = client.post(
        "/api/v1/mails/ingest",
        json={"de": "juan@bencen.com.ar", "asunto": "Cotización pigmento", "cuerpo": "100kg"},
    )
    op1 = r1.json()["mail"]["oportunidad_id"]

    # Respuesta del cliente (mismo asunto con "Re:", sin hilo / otra casilla):
    # se adjunta a la MISMA oportunidad en vez de duplicar.
    r2 = client.post(
        "/api/v1/mails/ingest",
        json={
            "de": "juan@bencen.com.ar",
            "asunto": "Re: Cotización pigmento",
            "cuerpo": "Confirmo",
        },
    )
    assert r2.status_code == 201
    assert r2.json()["mail"]["oportunidad_id"] == op1  # misma oportunidad

    with TestingSessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(Oportunidad)) == 1  # no duplicó
        assert db.scalar(select(func.count()).select_from(Mail)) == 2  # ambos mails quedaron

    # Un asunto distinto del mismo cliente SÍ crea otra oportunidad.
    r3 = client.post(
        "/api/v1/mails/ingest",
        json={"de": "juan@bencen.com.ar", "asunto": "Otro pedido distinto", "cuerpo": "x"},
    )
    assert r3.json()["mail"]["oportunidad_id"] != op1


def test_ingesta_no_comercial_descarta_sin_crear_oportunidad(client: TestClient) -> None:
    # IA que clasifica el mail como orden de compra (no comercial).
    app.dependency_overrides[get_ai] = lambda: FakeAI(
        EmailData(categoria="orden_compra")
    )
    resp = client.post(
        "/api/v1/mails/ingest",
        json={
            "de": "mesadeentrada@bencen.com.ar",
            "asunto": "Orden de Compra Nº 32787",
            "cuerpo": "Adjuntamos la orden de compra. La factura deberá enviarse a...",
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["descartado"] is True
    assert body["categoria"] == "orden_compra"
    assert body["mail"] is None

    # No se creó oportunidad ni quedó en la bandeja; sí un registro mínimo.
    from sqlalchemy import func, select

    with TestingSessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(Oportunidad)) == 0
        assert db.scalar(select(func.count()).select_from(Mail)) == 0
        descartado = db.scalars(select(MailDescartado)).first()
        assert descartado is not None and descartado.categoria == "orden_compra"
    assert client.get("/api/v1/mails").json() == []

    # Aparece en el listado de descartados (para auditarlo).
    descartados = client.get("/api/v1/mails/descartados").json()
    assert len(descartados) == 1
    assert descartados[0]["categoria"] == "orden_compra"
    assert descartados[0]["de"] == "mesadeentrada@bencen.com.ar"
