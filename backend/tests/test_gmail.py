"""Tests del parsing de Gmail y del poller (con fakes, sin tocar la API)."""

import base64
from collections.abc import Iterator
from typing import Any

import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.db.models.adjuntos import Adjunto
from app.db.models.clientes import Cliente
from app.db.models.contactos_cliente import ContactoCliente
from app.db.models.dominios_cliente import DominioCliente
from app.db.models.mails import Mail
from app.db.models.mails_descartados import MailDescartado
from app.db.models.notificaciones import Notificacion
from app.db.models.oportunidades import Oportunidad
from app.db.models.usuarios import Usuario
from app.integrations.ai.base import AIProvider, EmailData
from app.integrations.gmail.client import parse_gmail_message
from app.services.gmail_poller import build_poll_query, poll_once

engine = create_engine(
    "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
)
TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def _b64(text: str) -> str:
    return base64.urlsafe_b64encode(text.encode()).decode()


class FakeAI(AIProvider):
    def __init__(self) -> None:
        self.images_recibidas: list = []

    def extract_email_data(self, email_text, images=None) -> EmailData:  # noqa: ANN001
        self.images_recibidas = images or []
        return EmailData(producto="Pigmento", requerimiento=email_text[:30])

    def draft_quote(self, compras_response):  # noqa: ANN001
        raise NotImplementedError

    def summarize_thread(self, messages):  # noqa: ANN001
        return ""


class FakeGmail:
    def __init__(self, messages: dict[str, dict[str, Any]]) -> None:
        self._messages = messages

    def list_message_ids(self, query: str, max_results: int = 25) -> list[str]:
        return list(self._messages)

    def get_message(self, message_id: str) -> dict[str, Any]:
        return self._messages[message_id]


def test_parse_gmail_message_multipart() -> None:
    raw = {
        "id": "m1",
        "threadId": "t1",
        "internalDate": "1700000000000",
        "snippet": "resumen",
        "payload": {
            "mimeType": "multipart/alternative",
            "headers": [
                {"name": "From", "value": "Juan Perez <juan@bencen.com.ar>"},
                {"name": "Subject", "value": "Pedido de pigmento"},
                {"name": "To", "value": "ventas@argentinacolor.com"},
                {"name": "Message-ID", "value": "<CAF123@mail.gmail.com>"},
            ],
            "parts": [{"mimeType": "text/plain", "body": {"data": _b64("Necesito 100kg")}}],
        },
    }
    parsed = parse_gmail_message(raw)
    assert parsed["message_id"] == "m1"
    assert parsed["rfc_message_id"] == "<CAF123@mail.gmail.com>"  # header RFC para encadenar
    assert parsed["de"] == "juan@bencen.com.ar"  # se extrae el email del "From"
    assert parsed["asunto"] == "Pedido de pigmento"
    assert "100kg" in parsed["cuerpo"]
    assert parsed["fecha"] is not None
    assert parsed["es_automatico"] is False  # mail 1:1 humano


def test_parse_gmail_message_detecta_automatico() -> None:
    # Un mail con List-Unsubscribe es automático/masivo (newsletter, plataforma).
    raw = {
        "id": "m2",
        "threadId": "t2",
        "payload": {
            "mimeType": "text/plain",
            "headers": [
                {"name": "From", "value": "info@medox.ai"},
                {"name": "Subject", "value": "Nuevo vencimiento MED #15598"},
                {"name": "List-Unsubscribe", "value": "<https://medox.ai/unsub>"},
            ],
            "body": {"data": _b64("Ir a cotizar")},
        },
    }
    assert parse_gmail_message(raw)["es_automatico"] is True


@pytest.fixture()
def db() -> Iterator[Session]:
    Base.metadata.create_all(
        bind=engine,
        tables=[
            Usuario.__table__,
            Cliente.__table__,
            ContactoCliente.__table__,
            DominioCliente.__table__,
            Oportunidad.__table__,
            Mail.__table__,
            MailDescartado.__table__,
            Notificacion.__table__,
            Adjunto.__table__,
        ],
    )
    session = TestingSessionLocal()
    session.add(Cliente(id=1, razon_social="BENCEN S.A.", activo=True))
    session.add(DominioCliente(id=1, cliente_id=1, dominio="bencen.com.ar"))
    session.commit()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


def _msg(mid: str) -> dict[str, Any]:
    return {
        "message_id": mid,
        "thread_id": f"t-{mid}",
        "de": "juan@bencen.com.ar",
        "para": "ventas@argentinacolor.com",
        "asunto": "Pedido",
        "cuerpo": "Necesito 100kg de pigmento rojo",
        "fecha": None,
    }


def test_poll_procesa_nuevos_y_dedup(db: Session) -> None:
    gmail = FakeGmail({"m1": _msg("m1"), "m2": _msg("m2")})
    ai = FakeAI()

    # Primera corrida: procesa los 2 mails nuevos.
    assert poll_once(db, ai, gmail, query="x")["procesados"] == 2
    assert db.scalar(select(func.count()).select_from(Mail)) == 2
    # Identificó el cliente por dominio.
    op = db.scalars(select(Oportunidad)).first()
    assert op is not None and op.cliente_id == 1 and op.fuente == "mail"

    # Segunda corrida con los mismos ids: dedup -> no reprocesa.
    assert poll_once(db, ai, gmail, query="x")["procesados"] == 0
    assert db.scalar(select(func.count()).select_from(Mail)) == 2


class FakeAINoComercial(AIProvider):
    def extract_email_data(self, email_text, images=None) -> EmailData:  # noqa: ANN001
        return EmailData(categoria="orden_compra")

    def draft_quote(self, compras_response):  # noqa: ANN001
        raise NotImplementedError

    def summarize_thread(self, messages):  # noqa: ANN001
        return ""


def test_poll_descarta_no_comercial_y_dedup(db: Session) -> None:
    gmail = FakeGmail({"oc1": _msg("oc1")})

    # No crea oportunidad ni mail; sí un registro mínimo en descartados.
    assert poll_once(db, FakeAINoComercial(), gmail, query="x")["procesados"] == 0
    assert db.scalar(select(func.count()).select_from(Oportunidad)) == 0
    assert db.scalar(select(func.count()).select_from(Mail)) == 0
    desc = db.scalars(select(MailDescartado)).first()
    assert desc is not None and desc.categoria == "orden_compra"

    # Segunda corrida: dedup contra mails_descartados, no reprocesa.
    assert poll_once(db, FakeAINoComercial(), gmail, query="x")["procesados"] == 0
    assert db.scalar(select(func.count()).select_from(MailDescartado)) == 1


class FakeAIQuota(AIProvider):
    def extract_email_data(self, email_text, images=None) -> EmailData:  # noqa: ANN001
        raise RuntimeError("429 RESOURCE_EXHAUSTED: quota exceeded")

    def draft_quote(self, compras_response):  # noqa: ANN001
        raise NotImplementedError

    def summarize_thread(self, messages):  # noqa: ANN001
        return ""


def test_poll_reporta_error_de_cuota(db: Session) -> None:
    gmail = FakeGmail({"q1": _msg("q1")})
    r = poll_once(db, FakeAIQuota(), gmail, query="x")
    assert r["procesados"] == 0
    assert r["errores"] == 1
    assert "cuota" in (r["ultimo_error"] or "").lower()
    # No quedó registrado: en la próxima corrida se reintenta.
    assert db.scalar(select(func.count()).select_from(Mail)) == 0


def test_poll_ignora_remitente_automatico(db: Session) -> None:
    noreply = _msg("nr1")
    noreply["de"] = "no-reply@bencen.com.ar"
    gmail = FakeGmail({"nr1": noreply})
    r = poll_once(db, FakeAI(), gmail, query="x")
    assert r["procesados"] == 0
    # No creó oportunidad ni mail; quedó registrado para no re-descargarlo.
    assert db.scalar(select(func.count()).select_from(Oportunidad)) == 0
    desc = db.scalars(select(MailDescartado)).first()
    assert desc is not None and desc.categoria == "remitente_ignorado"
    # Segunda corrida: dedup, no reprocesa.
    assert poll_once(db, FakeAI(), gmail, query="x")["procesados"] == 0


def test_default_vendedor_id_cuando_cliente_no_tiene_vendedor(db: Session) -> None:
    # El cliente BENCEN (seed) no tiene vendedor asignado; debe heredar el de la casilla.
    db.add(Usuario(id=7, email="vendedor7@argentinacolor.com", nombre="Siete", activo=True))
    db.commit()
    gmail = FakeGmail({"x1": _msg("x1")})
    assert poll_once(db, FakeAI(), gmail, query="q", default_vendedor_id=7)["procesados"] == 1
    op = db.scalars(select(Oportunidad)).first()
    assert op is not None and op.cliente_id == 1 and op.vendedor_id == 7


def test_build_poll_query_combina_dominios_y_etiqueta(db: Session, monkeypatch) -> None:  # noqa: ANN001
    from app.config import settings

    monkeypatch.setattr(settings, "GMAIL_QUERY", "newer_than:2d")
    monkeypatch.setattr(settings, "GMAIL_LABEL", "crm")

    # El fixture siembra el dominio bencen.com.ar. La query debe combinar la
    # ventana temporal + exclusión de propios enviados + (etiqueta OR dominios).
    q = build_poll_query(db)
    assert q == "newer_than:2d -from:me (label:crm OR from:bencen.com.ar)"

    # Al agregar otro cliente con dominio, entra en la query automáticamente.
    db.add(Cliente(id=2, razon_social="OTRO S.A.", activo=True))
    db.add(DominioCliente(id=2, cliente_id=2, dominio="Otro.com"))
    db.commit()
    q2 = build_poll_query(db)
    assert "from:otro.com" in q2  # normalizado a minúsculas
    assert "from:bencen.com.ar" in q2
    assert "label:crm" in q2


def test_respuesta_del_hilo_no_duplica_oportunidad(db: Session) -> None:
    from app.services.ingest import process_incoming_email

    ai = FakeAI()
    # Primer mail: crea la oportunidad.
    m1 = process_incoming_email(
        db, ai, de="juan@bencen.com.ar", asunto="Pedido", cuerpo="Necesito 100kg",
        gmail_message_id="a1", gmail_thread_id="hilo-1",
    )
    assert m1 is not None and m1.oportunidad_id is not None
    op_id = m1.oportunidad_id

    # Respuesta en el MISMO hilo: se adjunta, NO crea otra oportunidad ni re-analiza.
    m2 = process_incoming_email(
        db, ai, de="juan@bencen.com.ar", asunto="Re: Pedido", cuerpo="No hay stock, gracias",
        gmail_message_id="a2", gmail_thread_id="hilo-1",
    )
    assert m2 is not None and m2.oportunidad_id == op_id
    assert m2.datos_extraidos_ia is None  # no se re-analiza (no gasta IA ni acusa)
    assert db.scalar(select(func.count()).select_from(Oportunidad)) == 1
    assert db.scalar(select(func.count()).select_from(Mail)) == 2


class FakeSender:
    """Cliente de Gmail de envío que solo registra la última llamada."""

    def __init__(self) -> None:
        self.enviado: dict[str, Any] | None = None

    def send_message(self, to, subject, body, thread_id=None, in_reply_to=None):  # noqa: ANN001
        self.enviado = {
            "to": to,
            "subject": subject,
            "body": body,
            "thread_id": thread_id,
            "in_reply_to": in_reply_to,
        }
        return {"message_id": "out-1", "thread_id": thread_id or "hilo-nuevo"}


def test_send_respuesta_registra_saliente_en_el_hilo(db: Session) -> None:
    from app.db.models.mails import DireccionMail
    from app.services.acuse import send_respuesta

    entrante = Mail(
        gmail_thread_id="hilo-1",
        gmail_message_id="in-1",
        rfc_message_id="<abc@mail.gmail.com>",
        direccion=DireccionMail.entrante,
        de="juan@bencen.com.ar",
        para="ventas@argentinacolor.com",
        asunto="Pedido",
        cuerpo="Necesito 100kg",
    )
    db.add(entrante)
    db.commit()

    sender = FakeSender()
    salida = send_respuesta(
        db, sender, entrante, "Te confirmo stock, saludos.",
        remitente="vendedor@argentinacolor.com",
    )

    # Se envió al cliente, dentro del mismo hilo, con Re: del asunto.
    assert sender.enviado["to"] == "juan@bencen.com.ar"
    assert sender.enviado["thread_id"] == "hilo-1"
    assert sender.enviado["subject"] == "Re: Pedido"
    # Se encadena vía In-Reply-To con el Message-ID del entrante.
    assert sender.enviado["in_reply_to"] == "<abc@mail.gmail.com>"
    # Quedó registrado como saliente, con el vendedor como remitente.
    assert salida.direccion == DireccionMail.saliente
    assert salida.de == "vendedor@argentinacolor.com"
    assert salida.para == "juan@bencen.com.ar"
    assert salida.gmail_thread_id == "hilo-1"


class FakeAIAclaracion(AIProvider):
    """Considera el pedido completo solo cuando aparece una cantidad ('kg')."""

    def extract_email_data(self, email_text, images=None) -> EmailData:  # noqa: ANN001
        completo = "kg" in email_text.lower()
        return EmailData(producto="Pigmento", requiere_aclaracion=not completo)

    def draft_quote(self, compras_response):  # noqa: ANN001
        raise NotImplementedError

    def summarize_thread(self, messages):  # noqa: ANN001
        return ""


def test_respuesta_resuelve_aclaracion_y_notifica(db: Session) -> None:
    from app.db.models.oportunidades import EstadoOportunidad
    from app.services.ingest import process_incoming_email

    db.add(Usuario(id=7, email="vendedor7@argentinacolor.com", nombre="Siete", activo=True))
    db.commit()
    ai = FakeAIAclaracion()

    # Primer mail sin cantidad -> queda en requiere_aclaracion, con vendedor 7.
    m1 = process_incoming_email(
        db, ai, de="juan@bencen.com.ar", asunto="Pedido", cuerpo="Necesito pigmento rojo",
        gmail_message_id="a1", gmail_thread_id="hilo-1", default_vendedor_id=7,
    )
    assert m1 is not None
    op = db.get(Oportunidad, m1.oportunidad_id)
    assert op.estado == EstadoOportunidad.requiere_aclaracion
    assert op.vendedor_id == 7

    # El cliente responde con la cantidad: se re-evalúa y se resuelve.
    m2 = process_incoming_email(
        db, ai, de="juan@bencen.com.ar", asunto="Re: Pedido", cuerpo="Son 100 kg",
        gmail_message_id="a2", gmail_thread_id="hilo-1",
    )
    db.refresh(op)
    assert op.estado == EstadoOportunidad.nueva  # volvió a estar lista
    assert m2.datos_extraidos_ia is not None  # guardó la extracción del hilo
    assert db.scalar(select(func.count()).select_from(Oportunidad)) == 1  # no duplicó

    # Se le creó una notificación al vendedor.
    noti = db.scalars(select(Notificacion)).all()
    assert len(noti) == 1
    assert noti[0].usuario_id == 7 and not noti[0].leida


def test_respuesta_sin_completar_sigue_en_aclaracion_sin_notificar(db: Session) -> None:
    from app.db.models.oportunidades import EstadoOportunidad
    from app.services.ingest import process_incoming_email

    db.add(Usuario(id=8, email="v8@argentinacolor.com", nombre="Ocho", activo=True))
    db.commit()
    ai = FakeAIAclaracion()

    m1 = process_incoming_email(
        db, ai, de="juan@bencen.com.ar", asunto="Pedido", cuerpo="Necesito pigmento",
        gmail_message_id="b1", gmail_thread_id="hilo-2", default_vendedor_id=8,
    )
    op = db.get(Oportunidad, m1.oportunidad_id)

    # Responde pero SIGUE sin dar la cantidad -> se queda en requiere_aclaracion.
    process_incoming_email(
        db, ai, de="juan@bencen.com.ar", asunto="Re: Pedido", cuerpo="Es para una obra",
        gmail_message_id="b2", gmail_thread_id="hilo-2",
    )
    db.refresh(op)
    assert op.estado == EstadoOportunidad.requiere_aclaracion
    assert db.scalar(select(func.count()).select_from(Notificacion)) == 0


def test_parse_convierte_html_a_texto_legible() -> None:
    html = (
        "<html><head><style>.x{color:red}</style><title>T</title></head><body>"
        "<p>Estimados,</p><p>Necesito cotizar 5 <strong>cartuchos HP 964</strong>.</p>"
        "Gracias<br>Simon</body></html>"
    )
    raw = {
        "id": "h1",
        "payload": {
            "mimeType": "text/html",
            "headers": [{"name": "From", "value": "cliente@itasa.com.ar"}],
            "body": {"data": _b64(html)},
        },
    }
    cuerpo = parse_gmail_message(raw)["cuerpo"]
    assert "<" not in cuerpo and ">" not in cuerpo  # sin tags
    assert "color:red" not in cuerpo  # se ignoró el <style>
    assert "cartuchos HP 964" in cuerpo
    assert "Estimados," in cuerpo


def test_parse_extrae_adjunto_de_imagen() -> None:
    raw = {
        "id": "m9",
        "payload": {
            "mimeType": "multipart/mixed",
            "headers": [{"name": "From", "value": "juan@bencen.com.ar"}],
            "parts": [
                {"mimeType": "text/plain", "body": {"data": _b64("Mirá la foto")}},
                {
                    "mimeType": "image/jpeg",
                    "filename": "toner.jpg",
                    "body": {"attachmentId": "att-1"},
                },
            ],
        },
    }
    att = parse_gmail_message(raw)["attachments"]
    assert len(att) == 1
    assert att[0]["nombre"] == "toner.jpg"
    assert att[0]["mime"] == "image/jpeg"
    assert att[0]["attachment_id"] == "att-1"


def test_parse_saltea_imagenes_de_firma() -> None:
    # Logo inline (Content-ID) y un ícono chico: son firma -> se saltean.
    # Solo se conserva la foto de producto (adjunto, sin cid, tamaño real).
    raw = {
        "id": "m10",
        "payload": {
            "mimeType": "multipart/mixed",
            "headers": [{"name": "From", "value": "juan@bencen.com.ar"}],
            "parts": [
                {"mimeType": "text/plain", "body": {"data": _b64("Mirá")}},
                {  # logo de firma, embebido
                    "mimeType": "image/png",
                    "filename": "logo.png",
                    "headers": [{"name": "Content-ID", "value": "<logo123>"}],
                    "body": {"attachmentId": "a-logo", "size": 4000},
                },
                {  # ícono chiquito
                    "mimeType": "image/png",
                    "filename": "icon.png",
                    "body": {"attachmentId": "a-icon", "size": 900},
                },
                {  # foto real de producto (adjunto, pesada)
                    "mimeType": "image/jpeg",
                    "filename": "producto.jpg",
                    "body": {"attachmentId": "a-prod", "size": 350_000},
                },
            ],
        },
    }
    att = parse_gmail_message(raw)["attachments"]
    assert [a["nombre"] for a in att] == ["producto.jpg"]


def test_flujo_multimodal_pasa_imagen_a_ia_y_guarda_adjunto(
    db: Session, tmp_path, monkeypatch
) -> None:  # noqa: ANN001
    from app.config import settings
    from app.db.models.adjuntos import Adjunto as AdjuntoModel
    from app.services.ingest import process_incoming_email

    monkeypatch.setattr(settings, "MEDIA_DIR", str(tmp_path))
    ai = FakeAI()

    mail = process_incoming_email(
        db,
        ai,
        de="juan@bencen.com.ar",
        asunto="Pedido con foto",
        cuerpo="Necesito esto",
        images=[{"nombre": "toner.jpg", "mime": "image/jpeg", "data": b"\xff\xd8\xff\x00datos"}],
    )

    # La IA recibió la imagen.
    assert len(ai.images_recibidas) == 1
    assert ai.images_recibidas[0].mime_type == "image/jpeg"

    # Se guardó el adjunto (fila + archivo en el storage; path_storage es la key).
    adj = db.scalars(select(AdjuntoModel).where(AdjuntoModel.mail_id == mail.id)).first()
    assert adj is not None and adj.nombre_archivo == "toner.jpg"
    from app.services.storage import get_storage

    assert get_storage().exists(adj.path_storage)
