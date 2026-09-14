"""Lógica de negocio de solicitudes a Compras: armado y envío del mail.

`build_email_preview` arma el texto (mismo formato que el Google Form) y
`enviar_a_compras` lo manda por Gmail desde la casilla del vendedor.
"""

import html as html_mod
import re
from datetime import datetime, timezone
from typing import Protocol

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models.adjuntos import Adjunto
from app.db.models.configuracion import Configuracion
from app.db.models.mails import DireccionMail, Mail
from app.db.models.oportunidades import Oportunidad
from app.db.models.solicitudes_compras import EstadoSolicitud, SolicitudCompras
from app.services.storage import get_storage

_SAFE = re.compile(r"[^A-Za-z0-9._-]+")


def adjuntos_de_oportunidad(db: Session, op: Oportunidad) -> list[dict]:
    """Lista unificada de archivos ya adjuntos a la oportunidad, para poder
    sumarlos al pedido a Compras. Cada item: {ref, filename, mime_type}.

    - "op:<id>"  -> adjunto cargado a la oportunidad (archivos_adjuntos).
    - "mail:<id>" -> adjunto que llegó en un mail del cliente (PDF/planilla).
    """
    items: list[dict] = []
    for m in op.archivos_adjuntos or []:
        if m.get("id") is not None and m.get("path"):
            items.append(
                {
                    "ref": f"op:{m['id']}",
                    "filename": m.get("filename") or "adjunto",
                    "mime_type": m.get("mime_type") or "application/octet-stream",
                }
            )
    adjuntos_mail = db.scalars(
        select(Adjunto)
        .join(Mail, Adjunto.mail_id == Mail.id)
        .where(Mail.oportunidad_id == op.id, Adjunto.path_storage.is_not(None))
        .order_by(Adjunto.id.asc())
    )
    for a in adjuntos_mail:
        items.append(
            {
                "ref": f"mail:{a.id}",
                "filename": a.nombre_archivo or "adjunto",
                "mime_type": a.mime_type or "application/octet-stream",
            }
        )
    return items


def _leer_bytes_ref(db: Session, op: Oportunidad, ref: str) -> dict | None:
    """Resuelve una ref ('op:<id>' / 'mail:<id>') a {filename, mime_type, data}.
    Devuelve None si no existe o no pertenece a la oportunidad."""
    storage = get_storage()
    tipo, _, sid = ref.partition(":")
    if not sid.isdigit():
        return None
    idn = int(sid)
    if tipo == "op":
        meta = next(
            (m for m in (op.archivos_adjuntos or []) if m.get("id") == idn), None
        )
        if not meta or not meta.get("path"):
            return None
        key, nombre, mime = meta["path"], meta.get("filename"), meta.get("mime_type")
    elif tipo == "mail":
        adj = db.get(Adjunto, idn)
        if adj is None or not adj.path_storage:
            return None
        # Debe pertenecer a un mail de esta oportunidad.
        if adj.mail is None or adj.mail.oportunidad_id != op.id:
            return None
        key, nombre, mime = adj.path_storage, adj.nombre_archivo, adj.mime_type
    else:
        return None
    try:
        data = storage.get(key)
    except FileNotFoundError:
        return None
    return {"filename": nombre or "adjunto", "mime_type": mime, "data": data}


def copiar_adjuntos_oportunidad(
    db: Session, solicitud: SolicitudCompras, op: Oportunidad, refs: list[str]
) -> None:
    """Copia a la solicitud los adjuntos de la oportunidad indicados por `refs`
    (para que viajen en el mail a Compras)."""
    archivos = [x for r in refs if (x := _leer_bytes_ref(db, op, r))]
    if archivos:
        guardar_adjuntos_solicitud(db, solicitud, archivos)


def guardar_adjuntos_solicitud(
    db: Session, solicitud: SolicitudCompras, archivos: list[dict]
) -> list[dict]:
    """Guarda los archivos en MEDIA_DIR/solicitudes/<id>/ y los agrega a
    `archivos_adjuntos`. `archivos`: [{filename, mime_type, data}]. Devuelve la
    lista completa de adjuntos de la solicitud."""
    storage = get_storage()
    metas = list(solicitud.archivos_adjuntos or [])
    base = len(metas)
    for idx, f in enumerate(archivos, start=base):
        nombre = _SAFE.sub("_", f.get("filename") or "archivo").strip("_") or "archivo"
        key = f"solicitudes/{solicitud.id}/{idx}_{nombre}"
        storage.put(key, f["data"], f.get("mime_type"))
        metas.append(
            {
                "filename": f.get("filename") or nombre,
                "mime_type": f.get("mime_type") or "application/octet-stream",
                "path": key,
            }
        )
    solicitud.archivos_adjuntos = metas  # reasignar dispara el UPDATE del JSONB
    db.commit()
    db.refresh(solicitud)
    return metas


class GmailSender(Protocol):
    def send_message(
        self,
        to: str,
        subject: str,
        body: str,
        thread_id: str | None = None,
        in_reply_to: str | None = None,
        cc: list[str] | None = None,
        attachments: list[dict] | None = None,
        html: str | None = None,
    ) -> dict[str, str | None]: ...

# Clave en la tabla `configuracion` con destinatarios por defecto:
#   {"to": "carlos@...", "cc": ["marcos@...", "karen@...", "diego@..."]}
CONFIG_KEY = "solicitudes_compras"


def _default_recipients(db: Session) -> tuple[str | None, list[str]]:
    cfg = db.get(Configuracion, CONFIG_KEY)
    valor = cfg.valor if cfg and cfg.valor else {}
    to = valor.get("to")
    cc = list(valor.get("cc", []))
    return to, cc


def get_destinatarios_compras(db: Session) -> dict:
    """Destinatarios configurados del mail a Compras: {to, cc}."""
    to, cc = _default_recipients(db)
    return {"to": to, "cc": cc}


def set_destinatarios_compras(
    db: Session, to: str | None, cc: list[str]
) -> dict:
    """Guarda los destinatarios del mail a Compras (clave `solicitudes_compras`)."""
    valor = {"to": to or None, "cc": cc or []}
    cfg = db.get(Configuracion, CONFIG_KEY)
    if cfg is None:
        db.add(Configuracion(clave=CONFIG_KEY, valor=valor))
    else:
        cfg.valor = valor  # reasignar dispara el UPDATE del JSONB
    db.commit()
    return valor


def _fmt(value: object | None) -> str:
    return str(value) if value not in (None, "") else "—"


def sugerir_requerimiento(db: Session, oportunidad_id: int) -> str:
    """Requerimiento pre-armado para el pedido a Compras.

    Prioriza el `requerimiento` cargado en la oportunidad (sea manual o el que
    compuso el ingest desde el mail); así una oportunidad manual también llega
    con su requerimiento al modal. Si está vacío, cae a lo que la IA extrajo del
    primer mail entrante (producto, cantidad, detalle, plazo). Devuelve "" si no
    hay nada para sugerir."""
    op = db.get(Oportunidad, oportunidad_id)
    if op is not None and (op.requerimiento or "").strip():
        return op.requerimiento.strip()

    mail = db.scalar(
        select(Mail)
        .where(
            Mail.oportunidad_id == oportunidad_id,
            Mail.direccion == DireccionMail.entrante,
            Mail.datos_extraidos_ia.is_not(None),
        )
        .order_by(Mail.id.asc())
    )
    datos = mail.datos_extraidos_ia if mail else None
    if not datos:
        return ""

    partes: list[str] = []
    if datos.get("producto"):
        partes.append(f"Producto: {datos['producto']}")
    if datos.get("cantidad"):
        partes.append(f"Cantidad: {datos['cantidad']}")
    if datos.get("requerimiento"):
        partes.append(datos["requerimiento"])
    if datos.get("plazo"):
        partes.append(f"Plazo requerido: {datos['plazo']}")
    return "\n".join(partes)


def build_email_preview(solicitud: SolicitudCompras, db: Session) -> dict:
    """Construye {to, cc, subject, body} del mail a Compras.

    Usa el destino guardado en la solicitud (el grupo que eligió el vendedor).
    Si no tiene (solicitudes viejas o usuarios sin grupos), cae al destinatario
    global de compatibilidad."""
    if solicitud.destino_to:
        to = solicitud.destino_to
        cc_base = list(solicitud.destino_cc or [])
    else:
        to, cc_base = _default_recipients(db)
    cc = [*cc_base, *(solicitud.ccs_extra or [])]

    op = solicitud.oportunidad
    cliente = op.cliente.razon_social if op and op.cliente else "Sin cliente"
    vendedor = solicitud.solicitante.nombre if solicitud.solicitante else "—"

    # Patrón de asunto que luego usa la IA para linkear la respuesta de Compras.
    subject = f"Solicitud {vendedor}: {cliente} - ID {solicitud.oportunidad_id}"

    importe = (
        f"USD {solicitud.importe_aproximado:,.2f}"
        if solicitud.importe_aproximado is not None
        else "—"
    )
    condicion = solicitud.condicion_pago.value if solicitud.condicion_pago else "—"

    numero_cliente = _fmt(solicitud.numero_cliente)
    fecha_limite = _fmt(solicitud.fecha_limite)
    ref_gbp = _fmt(solicitud.presupuesto_gbp_referencia)

    body = "\n".join(
        [
            "Hola,",
            "",
            "Solicito cotización para el siguiente requerimiento:",
            "",
            f"Solicitante: {vendedor}",
            f"Cliente: {cliente}",
            "",
            f"Número de cliente: {numero_cliente}",
            "",
            "Requerimiento:",
            solicitud.requerimiento,
            "",
            f"Condición de pago: {condicion}",
            f"Importe aproximado: {importe}",
            f"Fecha límite: {fecha_limite}",
            f"Referencia GBP: {ref_gbp}",
            "",
            "Gracias.",
        ]
    )

    html = _build_email_html(
        vendedor=vendedor,
        cliente=cliente,
        numero_cliente=numero_cliente,
        requerimiento=solicitud.requerimiento or "—",
        condicion=condicion,
        importe=importe,
        fecha_limite=fecha_limite,
        ref_gbp=ref_gbp,
    )

    return {"to": to, "cc": cc, "subject": subject, "body": body, "html": html}


def _build_email_html(
    *,
    vendedor: str,
    cliente: str,
    numero_cliente: str,
    requerimiento: str,
    condicion: str,
    importe: str,
    fecha_limite: str,
    ref_gbp: str,
) -> str:
    """Versión HTML del mail a Compras (espejo del cuerpo de texto)."""
    e = html_mod.escape
    req_html = e(requerimiento).replace("\n", "<br>")

    def fila(label: str, valor: str, *, fuerte: bool = False) -> str:
        v = f"<strong>{e(valor)}</strong>" if fuerte else e(valor)
        return (
            '<tr>'
            f'<td style="padding:3px 14px 3px 0;color:#6b7280;white-space:nowrap;'
            f'vertical-align:top">{e(label)}</td>'
            f'<td style="padding:3px 0;color:#111827">{v}</td>'
            '</tr>'
        )

    return (
        '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;'
        'color:#111827;line-height:1.5">'
        '<p style="margin:0 0 12px">Hola,</p>'
        '<p style="margin:0 0 12px">Solicito cotización para el siguiente '
        'requerimiento:</p>'
        '<table style="border-collapse:collapse;font-size:14px;margin-bottom:12px">'
        f'{fila("Solicitante", vendedor, fuerte=True)}'
        f'{fila("Cliente", cliente, fuerte=True)}'
        f'{fila("Número de cliente", numero_cliente)}'
        '</table>'
        '<p style="margin:0 0 4px;color:#6b7280">Requerimiento:</p>'
        '<div style="border-left:3px solid #e5e7eb;padding:2px 0 2px 12px;'
        f'margin-bottom:14px;white-space:pre-wrap">{req_html}</div>'
        '<table style="border-collapse:collapse;font-size:14px;margin-bottom:14px">'
        f'{fila("Condición de pago", condicion)}'
        f'{fila("Importe aproximado", importe)}'
        f'{fila("Fecha límite", fecha_limite)}'
        f'{fila("Referencia GBP", ref_gbp)}'
        '</table>'
        '<p style="margin:0">Gracias.</p>'
        '</div>'
    )


def _cargar_adjuntos(solicitud: SolicitudCompras) -> list[dict]:
    """Lee del storage los adjuntos de la solicitud y los deja listos para Gmail
    ([{filename, content, mime}]). Ignora los que ya no existan."""
    storage = get_storage()
    adjuntos: list[dict] = []
    for meta in solicitud.archivos_adjuntos or []:
        key = meta.get("path")
        if not key:
            continue
        try:
            content = storage.get(key)
        except FileNotFoundError:
            continue
        adjuntos.append(
            {
                "filename": meta.get("filename") or "adjunto",
                "content": content,
                "mime": meta.get("mime_type") or "application/octet-stream",
            }
        )
    return adjuntos


def enviar_a_compras(db: Session, gmail: GmailSender, solicitud: SolicitudCompras) -> str | None:
    """Envía el mail de solicitud a Compras (con adjuntos, si hay) y guarda el hilo.

    Devuelve el thread_id del envío. Lanza ValueError si no hay destinatario
    configurado (clave `solicitudes_compras` en `configuracion`)."""
    preview = build_email_preview(solicitud, db)
    if not preview["to"]:
        raise ValueError(
            "No hay email de Compras configurado. Cargalo en Configuración "
            "(destinatarios de solicitudes)."
        )
    sent = gmail.send_message(
        to=preview["to"],
        subject=preview["subject"],
        body=preview["body"],
        html=preview.get("html"),
        cc=preview["cc"] or None,
        attachments=_cargar_adjuntos(solicitud) or None,
    )
    ahora = datetime.now(timezone.utc)
    solicitud.gmail_thread_id = sent.get("thread_id")
    solicitud.fecha_envio = ahora
    solicitud.estado = EstadoSolicitud.enviada
    # Seguimiento: registrar en la oportunidad cuándo se mandó a Compras.
    if solicitud.oportunidad is not None and solicitud.oportunidad.fecha_enviado_compras is None:
        solicitud.oportunidad.fecha_enviado_compras = ahora.date()
    db.commit()
    db.refresh(solicitud)
    return solicitud.gmail_thread_id
