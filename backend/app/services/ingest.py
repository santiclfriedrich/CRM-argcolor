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

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models.contactos_cliente import ContactoCliente
from app.db.models.dominios_cliente import DominioCliente
from app.db.models.mails import DireccionMail, Mail
from app.db.models.mails_descartados import MailDescartado
from app.db.models.oportunidades import ESTADOS_CERRADOS, EstadoOportunidad, Oportunidad
from app.integrations.ai.base import AIProvider, DocumentPart, EmailData, ImagePart
from app.services.attachments import save_attachments
from app.services.documentos import enriquecer_cuerpo, es_pdf
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
    # Reacciones de Gmail (emoji): llegan como un mail aparte, no son contenido.
    "reacted to your message",
    "reaccionó a tu mensaje",
    "reacciono a tu mensaje",
    "reaccionó a través de gmail",
    "reacciono a traves de gmail",
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


def _contiene_palabra(texto: str, palabras: tuple[str, ...]) -> bool:
    """Match por palabra completa (evita falsos como 'rma' dentro de 'proforma')."""
    return any(re.search(rf"\b{re.escape(p)}\b", texto) for p in palabras)


def asunto_es_posventa(asunto: str | None) -> bool:
    return _contiene_palabra(normalizar_asunto(asunto), _ASUNTO_POSVENTA)


# Documentos administrativos / de facturación (los mandan proveedores o admin):
# no son una consulta de venta de un cliente.
_ASUNTO_ADMINISTRATIVO = (
    "proforma",
    "factura",
    "remito",
    "nota de credito",
    "nota de crédito",
    "nota de debito",
    "nota de débito",
    "orden de pago",
    "comprobante",
    "cobranza",
    "estado de cuenta",
    "resumen de cuenta",
)


def asunto_es_administrativo(asunto: str | None) -> bool:
    return _contiene_palabra(normalizar_asunto(asunto), _ASUNTO_ADMINISTRATIVO)


# Atribuciones citadas dentro del cuerpo ("De: X <mail>" de Outlook, o
# "... (<mail>) escribió:" de Gmail). Sirven para saber quién ORIGINÓ el hilo.
_RE_ATRIB_HEADER = re.compile(
    r"(?:^|\n)\s*(?:de|from)\s*:[^\n<]*?<?\s*([\w.\-+]+@[\w.\-]+)",
    re.IGNORECASE,
)
_RE_ATRIB_INLINE = re.compile(
    r"([\w.\-+]+@[\w.\-]+)[^\n]{0,80}?(?:escribió|escribio|wrote)\s*:",
    re.IGNORECASE,
)


def _remitente_raiz(cuerpo: str | None) -> str | None:
    """Email del que INICIÓ el hilo: la atribución citada más al fondo del
    cuerpo (la más antigua). None si el mail no cita ningún hilo previo."""
    candidatos: list[tuple[int, str]] = []
    for rx in (_RE_ATRIB_HEADER, _RE_ATRIB_INLINE):
        for m in rx.finditer(cuerpo or ""):
            candidatos.append((m.start(), m.group(1).strip().lower()))
    if not candidatos:
        return None
    # La atribución más abajo en el texto (mayor posición) = mensaje raíz.
    return max(candidatos, key=lambda t: t[0])[1]


# Orden de compra (OC) que el cliente ya envió/confirmó: es una compra cerrada,
# no una consulta a cotizar. NO crea oportunidad nueva (salvo que ya exista una
# para el hilo: en ese caso el mail se adjunta ANTES de este chequeo).
_RE_OC_ASUNTO = re.compile(
    r"\borden(?:es)? de compra\b"  # "orden de compra" (con o sin número)
    r"|\b(?:oc|o/c)\b\s*n?[°ºro.:\s\-]*\d",  # "OC 1234", "OC N° 1234", "O/C 12"
    re.IGNORECASE,
)
_FRASES_ORDEN_COMPRA = (
    "adjunto la oc",
    "adjunto oc",
    "en adjunto la oc",
    "adjunta la oc",
    "adjunto la orden de compra",
    "adjunto orden de compra",
    "adjunta la orden de compra",
    "adjunto nuestra orden de compra",
    "orden de compra adjunta",
    "envío la oc",
    "envio la oc",
    "enviamos la oc",
    "les envío la orden de compra",
    "les envio la orden de compra",
    "nuestra orden de compra",
    "su orden de compra",
)


def es_orden_compra(asunto: str | None, cuerpo: str | None) -> bool:
    """True si el mail trae/confirma una orden de compra ya emitida por el
    cliente (número de OC en el asunto o frase típica de OC adjunta)."""
    if _RE_OC_ASUNTO.search(asunto or ""):
        return True
    texto = (cuerpo or "").lower()
    return any(f in texto for f in _FRASES_ORDEN_COMPRA)


def hilo_iniciado_por_nosotros(cuerpo: str | None) -> bool:
    """True si el hilo lo originó una casilla propia (@argentinacolor.com).

    Un hilo que arrancamos nosotros pidiéndole algo a un tercero es
    abastecimiento/compras o gestión interna, no una consulta de un cliente:
    aunque el asunto diga "cotizar" y el que responde sea un proveedor, NOSOTROS
    somos el comprador -> no genera oportunidad.
    """
    from app.config import settings

    raiz = _remitente_raiz(cuerpo)
    if not raiz:
        return False
    dom = domain_of(raiz)
    return bool(dom and dom in settings.company_email_domains)


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


def _buscar_op_por_remitente_asunto(
    db: Session, de: str | None, asunto: str | None, now: datetime
) -> int | None:
    """Oportunidad ABIERTA reciente con un mail entrante del MISMO remitente y el
    mismo asunto normalizado. Es la red de última instancia: ataja duplicados
    cuando el hilo llega por otra casilla (otro thread_id) y encima el gateway del
    cliente rompió los headers de threading (References), y el dominio no está
    cargado como cliente. Devuelve el id o None."""
    norm = normalizar_asunto(asunto)
    addr = _solo_email(de)
    if not norm or not addr:
        return None
    limite = now - timedelta(days=_DIAS_DEDUP_ASUNTO)
    candidatos = db.scalars(
        select(Mail)
        .join(Oportunidad, Mail.oportunidad_id == Oportunidad.id)
        .where(
            Mail.direccion == DireccionMail.entrante,
            Mail.oportunidad_id.is_not(None),
            Oportunidad.estado.notin_(list(ESTADOS_CERRADOS)),
            Oportunidad.fecha_ultimo_movimiento >= limite,
            func.lower(Mail.de).like(f"%{addr}%"),
        )
        .order_by(Mail.id.desc())
        .limit(50)
    ).all()
    for m in candidatos:
        if _solo_email(m.de) == addr and normalizar_asunto(m.asunto) == norm:
            return m.oportunidad_id
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


def componer_requerimiento(datos: EmailData) -> str | None:
    """Arma el texto de requerimiento a partir de lo que la IA extrajo del mail
    (producto, cantidad, detalle, plazo). None si no hay nada."""
    partes: list[str] = []
    if datos.producto:
        partes.append(f"Producto: {datos.producto}")
    if datos.cantidad:
        partes.append(f"Cantidad: {datos.cantidad}")
    if datos.requerimiento:
        partes.append(datos.requerimiento)
    if datos.plazo:
        partes.append(f"Plazo requerido: {datos.plazo}")
    return "\n".join(partes) or None


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
    documentos: list[dict] | None = None,
    revisar: bool = False,
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
    # Imágenes + documentos (PDF/planillas): se guardan todos como adjuntos.
    adjuntos_todos = (images or []) + (documentos or [])

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
    # 0) Por Message-ID propio: el MISMO mensaje (mismo Message-ID global) puede
    # llegar a dos casillas nuestras (To + CC) -> gmail_message_id distinto pero
    # rfc_message_id igual. Match exacto, sin riesgo de fusionar mails distintos.
    if rfc_message_id:
        op_existente_id = db.scalar(
            select(Mail.oportunidad_id)
            .where(
                Mail.rfc_message_id == rfc_message_id,
                Mail.oportunidad_id.is_not(None),
            )
            .order_by(Mail.id.desc())
        )
    # 1) Por References/In-Reply-To: el mail responde a otro que ya está en una
    # oportunidad. Es lo más confiable (los Message-ID son globales -> funciona
    # aunque el hilo entre por otra casilla, cambie el asunto o no haya cliente).
    if op_existente_id is None and referencias:
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
    # 3b) Por (remitente + asunto): red de última instancia cuando no hay cliente
    # cargado ni References fiables (gateways que reescriben el mail, ej. Verallia).
    if op_existente_id is None:
        op_existente_id = _buscar_op_por_remitente_asunto(db, de, asunto, now)

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
                {"items": [{"nombre": i["nombre"], "mime": i["mime"]} for i in adjuntos_todos]}
                if adjuntos_todos
                else None
            ),
        )
        db.add(mail)
        db.flush()
        save_attachments(db, mail, adjuntos_todos)
        db.commit()
        db.refresh(mail)
        return mail

    # (No hay oportunidad existente para esta conversación.) Documento
    # administrativo/facturación NUEVO (proforma, factura, remito…): no es una
    # consulta de venta -> no crea oportunidad. Se chequea acá (no antes) para que
    # una respuesta de un cliente dentro de una oportunidad ya existente sí se
    # adjunte en vez de descartarse.
    if asunto_es_administrativo(asunto):
        db.add(
            MailDescartado(
                gmail_message_id=gmail_message_id,
                categoria="administrativo",
                de=de,
                asunto=asunto,
                fecha=fecha or now,
            )
        )
        db.commit()
        return None

    # Hilo que originó una casilla propia (le pedimos algo a un tercero: cotizar,
    # stock, precios): es abastecimiento/gestión interna, no una consulta de un
    # cliente. Se chequea acá (no antes) para que la respuesta de un cliente a una
    # oportunidad ya existente se adjunte en vez de descartarse.
    if hilo_iniciado_por_nosotros(cuerpo):
        db.add(
            MailDescartado(
                gmail_message_id=gmail_message_id,
                categoria="abastecimiento",
                de=de,
                asunto=asunto,
                fecha=fecha or now,
            )
        )
        db.commit()
        return None

    # Orden de compra ya emitida por el cliente (compra cerrada): no es una
    # consulta a cotizar -> no crea oportunidad NUEVA. Si el hilo ya tenía una
    # oportunidad, la OC se adjuntó más arriba (dedup) y no llega hasta acá.
    if es_orden_compra(asunto, cuerpo):
        db.add(
            MailDescartado(
                gmail_message_id=gmail_message_id,
                categoria="orden_compra",
                de=de,
                asunto=asunto,
                fecha=fecha or now,
            )
        )
        db.commit()
        return None

    image_parts = [ImagePart(data=img["data"], mime_type=img["mime"]) for img in (images or [])]
    # Adjuntos-documento: los PDF van a la IA nativos; las planillas (Excel/CSV)
    # se convierten a texto y se anexan al cuerpo (ahí suelen estar los ítems).
    doc_parts = [
        DocumentPart(data=d["data"], mime_type=d["mime"], filename=d.get("nombre"))
        for d in (documentos or [])
        if es_pdf(d.get("mime"), d.get("nombre"))
    ]
    texto_ia = enriquecer_cuerpo(cuerpo, documentos)
    extracted: EmailData = ai.extract_email_data(
        texto_ia, image_parts or None, doc_parts or None
    )

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
        requerimiento=componer_requerimiento(extracted),
        fecha_pedido_cliente=(fecha or now).date(),
        # Auto-ingestada (polling): entra como propuesta a revisar, no directo.
        pendiente_revision=revisar,
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
            {"items": [{"nombre": i["nombre"], "mime": i["mime"]} for i in adjuntos_todos]}
            if adjuntos_todos
            else None
        ),
    )
    db.add(mail)
    db.flush()  # asigna mail.id para los adjuntos
    save_attachments(db, mail, adjuntos_todos)
    db.commit()
    db.refresh(mail)
    return mail
