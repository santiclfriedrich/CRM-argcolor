"""Pipeline de procesamiento de un mail entrante (núcleo de la bandeja con IA).

Independiente del transporte: lo alimenta tanto la ingesta manual como, más
adelante, el polling/Pub-Sub de Gmail. Pasos:
  1. Identificar cliente por dominio del remitente.
  2. Identificar contacto por email exacto.
  3. Extraer datos del pedido con la IA.
  4. Crear la oportunidad (nueva o requiere_aclaracion) y registrar el mail.
"""

import re
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models.contactos_cliente import ContactoCliente
from app.db.models.dominios_cliente import DominioCliente
from app.db.models.mails import DireccionMail, Mail
from app.db.models.mails_descartados import MailDescartado
from app.db.models.oportunidades import ESTADOS_CERRADOS, EstadoOportunidad, Oportunidad
from app.integrations.ai.base import AIProvider, EmailData, ImagePart
from app.services.attachments import save_attachments
from app.services.notificaciones import crear_notificacion


def _solo_email(de: str | None) -> str:
    """`"Nombre <a@x.com>"` -> `a@x.com` (o el string tal cual si no hay <>)."""
    if not de:
        return ""
    m = re.search(r"<([^>]+)>", de)
    return (m.group(1) if m else de).strip().lower()


def domain_of(email: str | None) -> str | None:
    """`juan@bencen.com.ar` -> `bencen.com.ar` (tolera 'Nombre <...>')."""
    addr = _solo_email(email)
    if "@" not in addr:
        return None
    return addr.rsplit("@", 1)[1].strip().lower()


# Frases inequívocas de mail automático/masivo (no un mail 1:1 de un cliente).
_FRASES_AUTOMATICO = (
    "unsubscribe",
    "cancelar suscripción",
    "cancelar suscripcion",
    "desuscribir",
    "darse de baja",
    "date de baja",
    "este es un correo automático",
    "este es un mensaje automático",
    "no responder a este correo",
    "no respondas a este correo",
    "notificación automática",
    "notificacion automatica",
)


def es_notificacion_automatica(de: str | None, asunto: str | None, cuerpo: str | None) -> bool:
    """True si el mail es una notificación/recordatorio automático de una
    plataforma (no una consulta real de un cliente): por remitente en la
    denylist configurable, o por marcadores típicos (link de baja, etc.)."""
    from app.config import settings

    addr = _solo_email(de)
    dom = domain_of(de)
    for item in settings.ingest_sender_denylist:
        if item and (item == addr or item == dom or (dom and dom.endswith("." + item))):
            return True
    texto = f"{asunto or ''}\n{cuerpo or ''}".lower()
    return any(f in texto for f in _FRASES_AUTOMATICO)


# Cuántos días atrás miramos para deduplicar por (cliente + asunto).
_DIAS_DEDUP_ASUNTO = 30
_PREFIJOS_ASUNTO = re.compile(r"^\s*(re|rv|rf|fwd|fw|rvf)\s*:\s*", re.IGNORECASE)


def normalizar_asunto(asunto: str | None) -> str:
    """Quita prefijos de respuesta/reenvío (Re:, Rv:, Fwd:…) repetidos y baja a
    minúsculas, para comparar asuntos de una misma conversación."""
    s = (asunto or "").strip()
    while True:
        m = _PREFIJOS_ASUNTO.match(s)
        if not m:
            break
        s = s[m.end():]
    return s.strip().lower()


# Palabras del asunto que indican POSVENTA (reclamo/garantía/RMA): no es una
# compra nueva aunque en el último mensaje pidan un reemplazo o alternativa.
_ASUNTO_POSVENTA = (
    "reclamo",
    "garantía",
    "garantia",
    "rma",
    "posventa",
    "post venta",
    "post-venta",
    "devolución",
    "devolucion",
)


def asunto_es_posventa(asunto: str | None) -> bool:
    norm = normalizar_asunto(asunto)
    return any(k in norm for k in _ASUNTO_POSVENTA)


def _buscar_op_por_asunto(
    db: Session, cliente_id: int, asunto: str | None, now: datetime
) -> int | None:
    """Oportunidad ABIERTA reciente del mismo cliente con el mismo asunto
    normalizado. Ataja duplicados cuando la respuesta llega por otra casilla
    (otro thread_id) o sin hilo. Devuelve el id o None."""
    norm = normalizar_asunto(asunto)
    if not norm:
        return None  # sin asunto no deduplicamos (evita fusionar cualquier cosa)
    limite = now - timedelta(days=_DIAS_DEDUP_ASUNTO)
    candidatas = db.scalars(
        select(Oportunidad)
        .where(
            Oportunidad.cliente_id == cliente_id,
            Oportunidad.estado.notin_(list(ESTADOS_CERRADOS)),
            Oportunidad.fecha_ultimo_movimiento >= limite,
        )
        .order_by(Oportunidad.id.desc())
        .limit(50)
    ).all()
    for op in candidatas:
        if normalizar_asunto(op.asunto) == norm:
            return op.id
    return None


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
    from app.config import settings

    dominio = domain_of(remitente)
    # Un remitente del dominio propio (interno) NUNCA es un cliente: no matchear.
    if dominio and dominio in settings.company_email_domains:
        return None, None
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
    es_automatico: bool = False,
    referencias: list[str] | None = None,
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

    # Notificaciones/recordatorios automáticos de plataformas (ej. avisos de
    # licitaciones): NO crean oportunidad. Se descartan antes de todo (ni dedup
    # ni IA); quedan en mails_descartados para auditar.
    if es_automatico or es_notificacion_automatica(de, asunto, cuerpo):
        db.add(
            MailDescartado(
                gmail_message_id=gmail_message_id,
                categoria="automatico",
                de=de,
                asunto=asunto,
                fecha=fecha or now,
            )
        )
        db.commit()
        return None

    # Reclamo/garantía/RMA (posventa): no genera oportunidad, aunque el último
    # mensaje pida una alternativa/reemplazo (es parte de resolver el reclamo).
    if asunto_es_posventa(asunto):
        db.add(
            MailDescartado(
                gmail_message_id=gmail_message_id,
                categoria="posventa",
                de=de,
                asunto=asunto,
                fecha=fecha or now,
            )
        )
        db.commit()
        return None

    # Cliente por dominio del remitente: se usa para deduplicar y para crear la op.
    cliente_id, contacto_id = _match_cliente_y_contacto(db, de)

    # ¿Ya existe una oportunidad para esta conversación? 1) por hilo de Gmail;
    # 2) si no, por (cliente + asunto normalizado) en una oportunidad ABIERTA
    # reciente -> ataja duplicados cuando la respuesta llega por otra casilla
    # (otro thread_id) o sin hilo. Si existe, adjuntamos el mail en vez de crear
    # otra (no llama a la IA ni manda acuse).
    op_existente_id: int | None = None
    # 1) Por References/In-Reply-To: el mail responde a otro que ya está en una
    # oportunidad. Es lo más confiable (los Message-ID son globales -> funciona
    # aunque el hilo entre por otra casilla, cambie el asunto o no haya cliente).
    if referencias:
        op_existente_id = db.scalar(
            select(Mail.oportunidad_id)
            .where(
                Mail.rfc_message_id.in_(referencias),
                Mail.oportunidad_id.is_not(None),
            )
            .order_by(Mail.id.desc())
        )
    # 2) Por hilo de Gmail (misma casilla).
    if op_existente_id is None and gmail_thread_id:
        op_existente_id = db.scalar(
            select(Mail.oportunidad_id)
            .where(
                Mail.gmail_thread_id == gmail_thread_id,
                Mail.oportunidad_id.is_not(None),
            )
            .order_by(Mail.id.desc())
        )
    # 3) Por (cliente + asunto normalizado).
    if op_existente_id is None and cliente_id is not None:
        op_existente_id = _buscar_op_por_asunto(db, cliente_id, asunto, now)

    if op_existente_id is not None:
        op = db.get(Oportunidad, op_existente_id)
        datos_reeval: EmailData | None = None
        if op is not None:
            op.fecha_ultimo_movimiento = now
            # Si estábamos esperando una aclaración y el cliente respondió dentro
            # del mismo hilo, re-evaluamos con el contexto del hilo: si ya está
            # completa, vuelve a "nueva" y avisamos al vendedor.
            if gmail_thread_id and op.estado == EstadoOportunidad.requiere_aclaracion:
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

    estado = (
        EstadoOportunidad.requiere_aclaracion
        if extracted.requiere_aclaracion
        else EstadoOportunidad.nueva
    )

    # Vendedor: el dueño de la casilla que recibió el mail. Las cuentas son
    # compartidas, así que la oportunidad queda en la bandeja de quien recibió
    # el correo, sin importar el vendedor asignado a la cuenta.
    vendedor_id: int | None = default_vendedor_id

    oportunidad = Oportunidad(
        cliente_id=cliente_id,
        contacto_cliente_id=contacto_id,
        vendedor_id=vendedor_id,
        creado_por_id=vendedor_id,  # registro: de quién es la casilla que la generó
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
