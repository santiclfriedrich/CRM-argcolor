"""Acuse de recibo automático al cliente (envío por Gmail).

Arma el mail de acuse (personalizado con el nombre del contacto si está
identificado), lo envía por Gmail y registra el saliente en la tabla `mails`.
La plantilla es configurable vía la clave `plantilla_acuse_recibo` en
`configuracion`; si no existe, se usa una por defecto.
"""

from datetime import datetime, timezone
from typing import Protocol

from sqlalchemy.orm import Session

from app.config import settings
from app.db.models.configuracion import Configuracion
from app.db.models.contactos_cliente import ContactoCliente
from app.db.models.mails import DireccionMail, Mail

_CONFIG_KEY = "plantilla_acuse_recibo"
_DEFAULT_ASUNTO = "Recibimos tu consulta — ARG COLOR"
_DEFAULT_CUERPO = (
    "Hola{coma_nombre}:\n\n"
    "Recibimos tu consulta y ya la estamos procesando. Un asesor comercial se "
    "va a contactar a la brevedad.\n\n"
    "Saludos,\nEquipo Comercial ARG COLOR"
)


class GmailSender(Protocol):
    def send_message(
        self,
        to: str,
        subject: str,
        body: str,
        thread_id: str | None = None,
        in_reply_to: str | None = None,
    ) -> dict[str, str | None]: ...


def _rfc_message_id(db: Session, gmail: GmailSender, mail: Mail) -> str | None:
    """Message-ID (RFC) del mail entrante, para encadenar la respuesta.

    Si no está guardado (mail viejo, previo a esta feature) intenta traerlo de
    Gmail y lo backfillea. Si el hilo no está en esta casilla, devuelve None y la
    respuesta sale igual (sin encadenar)."""
    if mail.rfc_message_id:
        return mail.rfc_message_id
    getter = getattr(gmail, "get_message", None)
    if getter and mail.gmail_message_id:
        try:
            original = getter(mail.gmail_message_id)
        except Exception:  # noqa: BLE001 - el mensaje puede no estar en esta casilla
            return None
        rfc = original.get("rfc_message_id")
        if rfc:
            mail.rfc_message_id = rfc  # backfill para próximas respuestas
            db.commit()
        return rfc
    return None


def _first_name(db: Session, contacto_id: int | None) -> str:
    if contacto_id is None:
        return ""
    contacto = db.get(ContactoCliente, contacto_id)
    return contacto.nombre.split()[0] if contacto and contacto.nombre else ""


def build_acuse_email(mail: Mail, db: Session) -> dict[str, str]:
    """Devuelve {to, subject, body} del acuse para un mail entrante."""
    cfg = db.get(Configuracion, _CONFIG_KEY)
    valor = cfg.valor if cfg and cfg.valor else {}
    asunto_base = valor.get("asunto") or _DEFAULT_ASUNTO
    cuerpo_tpl = valor.get("cuerpo") or _DEFAULT_CUERPO

    contacto_id = mail.oportunidad.contacto_cliente_id if mail.oportunidad else None
    nombre = _first_name(db, contacto_id)

    cuerpo = cuerpo_tpl.format(
        nombre=nombre,
        coma_nombre=f" {nombre}" if nombre else "",
    )
    asunto = f"Re: {mail.asunto}" if mail.asunto else asunto_base
    return {"to": mail.de or "", "subject": asunto, "body": cuerpo}


def _send_and_record(
    db: Session,
    gmail: GmailSender,
    mail: Mail,
    subject: str,
    body: str,
    remitente: str | None = None,
    html_rico: str | None = None,
    attachments: list[dict] | None = None,
) -> Mail:
    """Envía un mail al remitente del entrante y registra el saliente.

    ``remitente`` es el email que queda como "De" del saliente (el vendedor que
    responde). Si no se pasa, cae a la casilla global (``GMAIL_USER``).
    ``html_rico`` es el cuerpo con formato del editor; ``attachments`` la lista de
    adjuntos ([{filename, content, mime}]).
    """
    if not mail.de:
        raise ValueError("El mail entrante no tiene remitente; no se puede responder.")

    from app.services.tracking import componer_html, nuevo_token

    in_reply_to = _rfc_message_id(db, gmail, mail)
    token = nuevo_token()
    html_out, rastreable = componer_html(html_rico, body, token)
    sent = gmail.send_message(
        to=mail.de,
        subject=subject,
        body=body,
        thread_id=mail.gmail_thread_id,
        in_reply_to=in_reply_to,
        **({"html": html_out} if html_out else {}),
        **({"attachments": attachments} if attachments else {}),
    )
    salida = Mail(
        gmail_message_id=sent.get("message_id"),
        gmail_thread_id=sent.get("thread_id") or mail.gmail_thread_id,
        oportunidad_id=mail.oportunidad_id,
        direccion=DireccionMail.saliente,
        de=remitente or settings.GMAIL_USER,
        para=mail.de,
        asunto=subject,
        cuerpo=body,
        fecha=datetime.now(timezone.utc),
        track_token=token if rastreable else None,
    )
    db.add(salida)
    db.commit()
    db.refresh(salida)
    return salida


def send_acuse(db: Session, gmail: GmailSender, mail: Mail) -> Mail:
    """Envía el acuse de recibo genérico al remitente del mail."""
    draft = build_acuse_email(mail, db)
    return _send_and_record(db, gmail, mail, draft["subject"], draft["body"])


def send_aclaracion(
    db: Session, gmail: GmailSender, mail: Mail, cuerpo: str | None = None
) -> Mail:
    """Envía al cliente la aclaración. `cuerpo` (opcional) permite mandar el
    borrador editado a mano; si no viene, usa el que redactó la IA."""
    datos = mail.datos_extraidos_ia or {}
    borrador = (cuerpo or "").strip() or datos.get("borrador_aclaracion")
    if not borrador:
        raise ValueError("Este mail no tiene un borrador de aclaración para enviar.")
    asunto = f"Re: {mail.asunto}" if mail.asunto else "Tu consulta — ARG COLOR"
    return _send_and_record(db, gmail, mail, asunto, borrador)


def send_respuesta(
    db: Session,
    gmail: GmailSender,
    mail: Mail,
    cuerpo: str,
    remitente: str | None = None,
    asunto: str | None = None,
    html: str | None = None,
    attachments: list[dict] | None = None,
) -> Mail:
    """Envía una respuesta de texto libre al cliente, dentro del mismo hilo.

    La escribe el vendedor desde la bandeja (chat). Si no se pasa ``asunto``,
    responde con ``Re: <asunto original>``. ``html`` es el cuerpo con formato y
    ``attachments`` los archivos adjuntos."""
    if (not cuerpo or not cuerpo.strip()) and not (html and html.strip()):
        raise ValueError("La respuesta no puede estar vacía.")
    subject = asunto or (f"Re: {mail.asunto}" if mail.asunto else "Tu consulta — ARG COLOR")
    return _send_and_record(
        db,
        gmail,
        mail,
        subject,
        cuerpo,
        remitente=remitente,
        html_rico=html,
        attachments=attachments,
    )
