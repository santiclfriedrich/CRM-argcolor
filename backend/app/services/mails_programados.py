"""Envío de los mails programados vencidos (Fase 3: programar envío).

Un job del scheduler llama a `enviar_programados_vencidos` cada minuto: manda los
que ya llegaron a su hora desde la casilla del usuario y los deja en Enviados.
"""

import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models.mails import DireccionMail, Mail
from app.db.models.mails_programados import MailProgramado
from app.db.models.usuarios import Usuario

logger = logging.getLogger(__name__)


def _leer_adjuntos(metas: list | None) -> list[dict]:
    """Baja del storage los adjuntos guardados para el programado
    ([{filename, content, mime}])."""
    from app.services.storage import get_storage

    storage = get_storage()
    out: list[dict] = []
    for m in metas or []:
        key = m.get("path")
        if not key:
            continue
        try:
            data = storage.get(key)
        except FileNotFoundError:
            continue
        out.append(
            {
                "filename": m.get("filename") or "adjunto",
                "content": data,
                "mime": m.get("mime") or "application/octet-stream",
            }
        )
    return out


def enviar_programados_vencidos(db: Session) -> int:
    """Manda los programados con `programado_para <= ahora` y no enviados.

    Devuelve cuántos se enviaron. Un envío fallido guarda el error y se reintenta
    en la próxima corrida (no bloquea a los demás)."""
    from app.core.crypto import decrypt
    from app.integrations.gmail.client import GmailClient

    ahora = datetime.now(timezone.utc)
    pendientes = list(
        db.scalars(
            select(MailProgramado).where(
                MailProgramado.enviado.is_(False),
                MailProgramado.programado_para <= ahora,
            )
        )
    )
    enviados = 0
    for mp in pendientes:
        usuario = db.get(Usuario, mp.usuario_id)
        if usuario is None or not usuario.gmail_refresh_token:
            mp.error = "El usuario no tiene Gmail conectado."
            db.commit()
            continue
        token = decrypt(usuario.gmail_refresh_token)
        if not token:
            mp.error = "No se pudo leer el token de Gmail del usuario."
            db.commit()
            continue
        try:
            from app.services.tracking import componer_html, nuevo_token

            gmail = GmailClient(refresh_token=token)
            track = nuevo_token()
            html, rastreable = componer_html(mp.html, mp.cuerpo, track)
            adjuntos = _leer_adjuntos(mp.adjuntos)
            sent = gmail.send_message(
                to=mp.para,
                subject=mp.asunto or "",
                body=mp.cuerpo,
                **({"html": html} if html else {}),
                **({"attachments": adjuntos} if adjuntos else {}),
            )
            mp.enviado = True
            mp.fecha_envio = datetime.now(timezone.utc)
            mp.error = None
            db.add(
                Mail(
                    gmail_message_id=sent.get("message_id"),
                    gmail_thread_id=sent.get("thread_id"),
                    direccion=DireccionMail.saliente,
                    de=usuario.email,
                    para=mp.para,
                    asunto=mp.asunto,
                    cuerpo=mp.cuerpo,
                    fecha=mp.fecha_envio,
                    leido=True,
                    carpeta="enviados",
                    usuario_id=usuario.id,
                    track_token=track if rastreable else None,
                )
            )
            enviados += 1
        except Exception as exc:  # noqa: BLE001 - un envío fallido no corta el resto
            db.rollback()
            mp.error = str(exc)[:200]
            logger.exception("No se pudo enviar el mail programado %s", mp.id)
        db.commit()
    return enviados
