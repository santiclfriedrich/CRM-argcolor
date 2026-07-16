"""Lógica de negocio de solicitudes a Compras: armado y envío del mail.

`build_email_preview` arma el texto (mismo formato que el Google Form) y
`enviar_a_compras` lo manda por Gmail desde la casilla del vendedor.
"""

import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Protocol

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.db.models.configuracion import Configuracion
from app.db.models.mails import DireccionMail, Mail
from app.db.models.solicitudes_compras import EstadoSolicitud, SolicitudCompras

_SAFE = re.compile(r"[^A-Za-z0-9._-]+")


def guardar_adjuntos_solicitud(
    db: Session, solicitud: SolicitudCompras, archivos: list[dict]
) -> list[dict]:
    """Guarda los archivos en MEDIA_DIR/solicitudes/<id>/ y los agrega a
    `archivos_adjuntos`. `archivos`: [{filename, mime_type, data}]. Devuelve la
    lista completa de adjuntos de la solicitud."""
    dest = Path(settings.MEDIA_DIR) / "solicitudes" / str(solicitud.id)
    dest.mkdir(parents=True, exist_ok=True)
    metas = list(solicitud.archivos_adjuntos or [])
    base = len(metas)
    for idx, f in enumerate(archivos, start=base):
        nombre = _SAFE.sub("_", f.get("filename") or "archivo").strip("_") or "archivo"
        ruta = dest / f"{idx}_{nombre}"
        ruta.write_bytes(f["data"])
        metas.append(
            {
                "filename": f.get("filename") or nombre,
                "mime_type": f.get("mime_type") or "application/octet-stream",
                "path": str(ruta),
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
    """Arma un requerimiento para Compras a partir de lo que la IA ya extrajo
    del mail original del cliente (producto, cantidad, detalle, plazo).

    Toma el primer mail entrante de la oportunidad con datos de IA (el pedido
    original). Devuelve "" si no hay nada para sugerir."""
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
    """Construye {to, cc, subject, body} del mail a Compras."""
    to, cc_default = _default_recipients(db)
    cc = [*cc_default, *(solicitud.ccs_extra or [])]

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

    body = "\n".join(
        [
            "Hola,",
            "",
            "Solicito cotización para el siguiente requerimiento:",
            "",
            f"Solicitante: {vendedor}",
            f"Cliente: {cliente}",
            "",
            f"Número de cliente: {_fmt(solicitud.numero_cliente)}",
            "",
            "Requerimiento:",
            solicitud.requerimiento,
            "",
            f"Condición de pago: {condicion}",
            f"Importe aproximado: {importe}",
            f"Fecha límite: {_fmt(solicitud.fecha_limite)}",
            f"Referencia GBP: {_fmt(solicitud.presupuesto_gbp_referencia)}",
            "",
            "Gracias.",
        ]
    )

    return {"to": to, "cc": cc, "subject": subject, "body": body}


def _cargar_adjuntos(solicitud: SolicitudCompras) -> list[dict]:
    """Lee del disco los adjuntos de la solicitud y los deja listos para Gmail
    ([{filename, content, mime}]). Ignora los que ya no existan."""
    adjuntos: list[dict] = []
    for meta in solicitud.archivos_adjuntos or []:
        ruta = Path(meta.get("path", ""))
        if not ruta.is_file():
            continue
        adjuntos.append(
            {
                "filename": meta.get("filename") or ruta.name,
                "content": ruta.read_bytes(),
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
