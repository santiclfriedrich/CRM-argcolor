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
        self, to: str, subject: str, body: str, thread_id: str | None = None
    ) -> dict[str, str | None]: ...


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


def _send_and_record(db: Session, gmail: GmailSender, mail: Mail, subject: str, body: str) -> Mail:
    """Envía un mail al remitente del entrante y registra el saliente."""
    if not mail.de:
        raise ValueError("El mail entrante no tiene remitente; no se puede responder.")

    sent = gmail.send_message(
        to=mail.de, subject=subject, body=body, thread_id=mail.gmail_thread_id
    )
    salida = Mail(
        gmail_message_id=sent.get("message_id"),
        gmail_thread_id=sent.get("thread_id") or mail.gmail_thread_id,
        oportunidad_id=mail.oportunidad_id,
        direccion=DireccionMail.saliente,
        de=settings.GMAIL_USER,
        para=mail.de,
        asunto=subject,
        cuerpo=body,
        fecha=datetime.now(timezone.utc),
    )
    db.add(salida)
    db.commit()
    db.refresh(salida)
    return salida


def send_acuse(db: Session, gmail: GmailSender, mail: Mail) -> Mail:
    """Envía el acuse de recibo genérico al remitente del mail."""
    draft = build_acuse_email(mail, db)
    return _send_and_record(db, gmail, mail, draft["subject"], draft["body"])


def send_aclaracion(db: Session, gmail: GmailSender, mail: Mail) -> Mail:
    """Envía al cliente el borrador de aclaración que redactó la IA."""
    datos = mail.datos_extraidos_ia or {}
    borrador = datos.get("borrador_aclaracion")
    if not borrador:
        raise ValueError("Este mail no tiene un borrador de aclaración para enviar.")
    asunto = f"Re: {mail.asunto}" if mail.asunto else "Tu consulta — ARG COLOR"
    return _send_and_record(db, gmail, mail, asunto, borrador)
