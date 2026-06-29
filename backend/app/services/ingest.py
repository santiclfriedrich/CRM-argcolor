"""Pipeline de procesamiento de un mail entrante (núcleo de la bandeja con IA).

Independiente del transporte: lo alimenta tanto la ingesta manual como, más
adelante, el polling/Pub-Sub de Gmail. Pasos:
  1. Identificar cliente por dominio del remitente.
  2. Identificar contacto por email exacto.
  3. Extraer datos del pedido con la IA.
  4. Crear la oportunidad (nueva o requiere_aclaracion) y registrar el mail.
"""

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models.contactos_cliente import ContactoCliente
from app.db.models.dominios_cliente import DominioCliente
from app.db.models.mails import DireccionMail, Mail
from app.db.models.oportunidades import EstadoOportunidad, Oportunidad
from app.integrations.ai.base import AIProvider, EmailData


def domain_of(email: str | None) -> str | None:
    """`juan@bencen.com.ar` -> `bencen.com.ar`."""
    if not email or "@" not in email:
        return None
    return email.rsplit("@", 1)[1].strip().lower()


def _match_cliente_y_contacto(
    db: Session, remitente: str | None
) -> tuple[int | None, int | None]:
    """Devuelve (cliente_id, contacto_cliente_id) según dominio y email."""
    dominio = domain_of(remitente)
    cliente_id: int | None = None
    if dominio:
        dom = db.scalar(select(DominioCliente).where(DominioCliente.dominio == dominio))
        if dom:
            cliente_id = dom.cliente_id

    contacto_id: int | None = None
    if remitente:
        contacto = db.scalar(
            select(ContactoCliente).where(ContactoCliente.email == remitente.strip())
        )
        if contacto:
            contacto_id = contacto.id
            cliente_id = cliente_id or contacto.cliente_id
    return cliente_id, contacto_id


def process_incoming_email(
    db: Session,
    ai: AIProvider,
    *,
    de: str | None,
    asunto: str | None,
    cuerpo: str,
    para: str | None = None,
    fecha: datetime | None = None,
    gmail_message_id: str | None = None,
    gmail_thread_id: str | None = None,
    image_paths: list[str] | None = None,
) -> Mail:
    """Procesa un mail entrante y crea la oportunidad + el registro de mail."""
    cliente_id, contacto_id = _match_cliente_y_contacto(db, de)

    extracted: EmailData = ai.extract_email_data(cuerpo, image_paths)

    estado = (
        EstadoOportunidad.requiere_aclaracion
        if extracted.requiere_aclaracion
        else EstadoOportunidad.nueva
    )

    # Si el cliente está identificado y tiene vendedor asignado, hereda el vendedor.
    vendedor_id: int | None = None
    if cliente_id is not None:
        from app.db.models.clientes import Cliente

        cliente = db.get(Cliente, cliente_id)
        vendedor_id = cliente.vendedor_asignado_id if cliente else None

    now = datetime.now(timezone.utc)
    oportunidad = Oportunidad(
        cliente_id=cliente_id,
        contacto_cliente_id=contacto_id,
        vendedor_id=vendedor_id,
        estado=estado,
        fuente="mail",
        fecha_ultimo_movimiento=now,
    )
    db.add(oportunidad)
    db.flush()  # asigna oportunidad.id

    mail = Mail(
        gmail_message_id=gmail_message_id,
        gmail_thread_id=gmail_thread_id,
        oportunidad_id=oportunidad.id,
        direccion=DireccionMail.entrante,
        de=de,
        para=para,
        asunto=asunto,
        cuerpo=cuerpo,
        fecha=fecha or now,
        datos_extraidos_ia=extracted.model_dump(),
    )
    db.add(mail)
    db.commit()
    db.refresh(mail)
    return mail
