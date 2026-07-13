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
from app.db.models.mails_descartados import MailDescartado
from app.db.models.oportunidades import EstadoOportunidad, Oportunidad
from app.integrations.ai.base import AIProvider, EmailData, ImagePart
from app.services.attachments import save_attachments
from app.services.notificaciones import crear_notificacion


def domain_of(email: str | None) -> str | None:
    """`juan@bencen.com.ar` -> `bencen.com.ar`."""
    if not email or "@" not in email:
        return None
    return email.rsplit("@", 1)[1].strip().lower()


def _reevaluar_hilo(
    db: Session,
    ai: AIProvider,
    thread_id: str,
    nuevo_cuerpo: str,
    images: list[dict] | None,
) -> EmailData | None:
    """Re-extrae los datos del pedido usando TODO el hilo como contexto.

    Arma un transcript (mails previos del hilo + la respuesta nueva) para que la
    IA entienda que el cliente está completando datos que faltaban."""
    previos = db.scalars(
        select(Mail)
        .where(Mail.gmail_thread_id == thread_id)
        .order_by(Mail.fecha.asc().nullslast(), Mail.id.asc())
    )
    lineas: list[str] = []
    for m in previos:
        if m.cuerpo:
            rol = "Cliente" if m.direccion == DireccionMail.entrante else "Nosotros"
            lineas.append(f"[{rol}]\n{m.cuerpo}")
    lineas.append(f"[Cliente]\n{nuevo_cuerpo}")
    transcript = "\n\n---\n\n".join(lineas)

    image_parts = [ImagePart(data=i["data"], mime_type=i["mime"]) for i in (images or [])]
    return ai.extract_email_data(transcript, image_parts or None)


def _notificar_aclaracion_resuelta(db: Session, op: Oportunidad) -> None:
    """Avisa (in-app) al vendedor que la aclaración se resolvió y la oportunidad
    volvió a estar lista para avanzar."""
    if op.vendedor_id is None:
        return
    quien = op.cliente.razon_social if op.cliente else "un cliente"
    crear_notificacion(
        db,
        usuario_id=op.vendedor_id,
        mensaje=(
            f"{quien} respondió la aclaración de la oportunidad #{op.id}. "
            "Ya está lista para avanzar."
        ),
        link="/oportunidades",
    )


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
    rfc_message_id: str | None = None,
    images: list[dict] | None = None,
    default_vendedor_id: int | None = None,
) -> Mail | None:
    """Procesa un mail entrante y crea la oportunidad + el registro de mail.

    Devuelve el `Mail` creado, o `None` si la IA lo clasificó como NO comercial
    (orden de compra, facturación, newsletter, etc.): en ese caso no se crea
    oportunidad ni registro de mail, solo una fila mínima en `mails_descartados`
    para no reprocesarlo y poder auditarlo.

    `images`: lista de {nombre, mime, data(bytes)} de los adjuntos de imagen.
    Se pasan a la IA (multimodal) y se persisten como `adjuntos`.
    `default_vendedor_id`: dueño de la casilla de la que vino el mail (Camino B);
    se usa como vendedor si el cliente no tiene uno asignado.
    """
    now = datetime.now(timezone.utc)

    # Thread-aware (Slice 5): si el hilo ya tiene una oportunidad, adjuntamos el
    # mail a ELLA en vez de crear otra. Evita duplicar cuando el cliente responde
    # o cuando el propio vendedor contesta dentro del mismo hilo. No llama a la IA
    # ni manda acuse (queda como parte de la conversación en curso).
    if gmail_thread_id:
        op_existente_id = db.scalar(
            select(Mail.oportunidad_id)
            .where(
                Mail.gmail_thread_id == gmail_thread_id,
                Mail.oportunidad_id.is_not(None),
            )
            .order_by(Mail.id.desc())
        )
        if op_existente_id is not None:
            op = db.get(Oportunidad, op_existente_id)
            datos_reeval: EmailData | None = None
            if op is not None:
                op.fecha_ultimo_movimiento = now
                # Slice 5 conversacional: si estábamos esperando una aclaración y
                # el cliente respondió, re-evaluamos con el contexto del hilo. Si
                # ya está completa, la oportunidad vuelve a "nueva" y avisamos al
                # vendedor. Si sigue faltando, se queda en requiere_aclaracion.
                if op.estado == EstadoOportunidad.requiere_aclaracion:
                    reeval = _reevaluar_hilo(db, ai, gmail_thread_id, cuerpo, images)
                    if reeval is not None and reeval.categoria == "consulta_comercial":
                        datos_reeval = reeval
                        if not reeval.requiere_aclaracion:
                            op.estado = EstadoOportunidad.nueva
                            _notificar_aclaracion_resuelta(db, op)
            mail = Mail(
                gmail_message_id=gmail_message_id,
                gmail_thread_id=gmail_thread_id,
                rfc_message_id=rfc_message_id,
                oportunidad_id=op_existente_id,
                direccion=DireccionMail.entrante,
                de=de,
                para=para,
                asunto=asunto,
                cuerpo=cuerpo,
                fecha=fecha or now,
                # Datos solo si la re-evaluación aportó algo; si no, es una
                # respuesta más del hilo y no se re-analiza.
                datos_extraidos_ia=datos_reeval.model_dump() if datos_reeval else None,
                adjuntos=(
                    {"items": [{"nombre": i["nombre"], "mime": i["mime"]} for i in images]}
                    if images
                    else None
                ),
            )
            db.add(mail)
            db.flush()
            save_attachments(db, mail, images or [])
            db.commit()
            db.refresh(mail)
            return mail

    image_parts = [ImagePart(data=img["data"], mime_type=img["mime"]) for img in (images or [])]
    extracted: EmailData = ai.extract_email_data(cuerpo, image_parts or None)

    # Triage: solo las consultas comerciales generan oportunidad y se guardan.
    if extracted.categoria != "consulta_comercial":
        descartado = MailDescartado(
            gmail_message_id=gmail_message_id,
            categoria=extracted.categoria,
            de=de,
            asunto=asunto,
            fecha=fecha or datetime.now(timezone.utc),
        )
        db.add(descartado)
        db.commit()
        return None

    cliente_id, contacto_id = _match_cliente_y_contacto(db, de)

    estado = (
        EstadoOportunidad.requiere_aclaracion
        if extracted.requiere_aclaracion
        else EstadoOportunidad.nueva
    )

    # Vendedor: el asignado al cliente; si no hay, el dueño de la casilla.
    vendedor_id: int | None = default_vendedor_id
    if cliente_id is not None:
        from app.db.models.clientes import Cliente

        cliente = db.get(Cliente, cliente_id)
        if cliente and cliente.vendedor_asignado_id:
            vendedor_id = cliente.vendedor_asignado_id

    oportunidad = Oportunidad(
        cliente_id=cliente_id,
        contacto_cliente_id=contacto_id,
        vendedor_id=vendedor_id,
        estado=estado,
        fuente="mail",
        fecha_ultimo_movimiento=now,
        # Seguimiento: el asunto y la fecha del pedido salen del mail original.
        asunto=asunto,
        fecha_pedido_cliente=(fecha or now).date(),
    )
    db.add(oportunidad)
    db.flush()  # asigna oportunidad.id

    mail = Mail(
        gmail_message_id=gmail_message_id,
        gmail_thread_id=gmail_thread_id,
        rfc_message_id=rfc_message_id,
        oportunidad_id=oportunidad.id,
        direccion=DireccionMail.entrante,
        de=de,
        para=para,
        asunto=asunto,
        cuerpo=cuerpo,
        fecha=fecha or now,
        datos_extraidos_ia=extracted.model_dump(),
        adjuntos=(
            {"items": [{"nombre": i["nombre"], "mime": i["mime"]} for i in images]}
            if images
            else None
        ),
    )
    db.add(mail)
    db.flush()  # asigna mail.id para los adjuntos
    save_attachments(db, mail, images or [])
    db.commit()
    db.refresh(mail)
    return mail
