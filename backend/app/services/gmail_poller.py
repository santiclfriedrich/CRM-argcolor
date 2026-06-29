"""Polling de la casilla comercial: trae mails nuevos y los mete al pipeline.

Desacoplado del cliente concreto (recibe cualquier objeto con
list_message_ids/get_message) para poder testearlo con un fake.
"""

import logging
from typing import Any, Protocol

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.db.models.mails import Mail
from app.integrations.ai.base import AIProvider
from app.services.ingest import process_incoming_email

logger = logging.getLogger(__name__)


class GmailLike(Protocol):
    def list_message_ids(self, query: str, max_results: int = 25) -> list[str]: ...
    def get_message(self, message_id: str) -> dict[str, Any]: ...


def poll_once(db: Session, ai: AIProvider, gmail: GmailLike, query: str | None = None) -> int:
    """Procesa los mails nuevos (no vistos antes) y devuelve cuántos creó."""
    ids = gmail.list_message_ids(query or settings.GMAIL_QUERY)
    if not ids:
        return 0

    # Dedup: solo procesamos los message_id que no estén ya registrados.
    existing = set(
        db.scalars(select(Mail.gmail_message_id).where(Mail.gmail_message_id.in_(ids)))
    )
    nuevos = [mid for mid in ids if mid not in existing]

    procesados = 0
    for mid in nuevos:
        try:
            msg = gmail.get_message(mid)
            mail = process_incoming_email(
                db,
                ai,
                de=msg.get("de"),
                asunto=msg.get("asunto"),
                cuerpo=msg.get("cuerpo") or "",
                para=msg.get("para"),
                fecha=msg.get("fecha"),
                gmail_message_id=msg.get("message_id"),
                gmail_thread_id=msg.get("thread_id"),
            )
            procesados += 1
            _maybe_acuse(db, gmail, mail)
        except Exception:  # noqa: BLE001 - un mail malo no debe cortar el lote
            logger.exception("Error procesando el mail %s; se omite", mid)
    return procesados


def _maybe_acuse(db: Session, gmail: object, mail: Mail) -> None:
    """Respuesta automática según los flags configurables:
    - pedido claro -> acuse de recibo (si acuse_automatico)
    - requiere aclaración -> aclaración al cliente (si aclaracion_automatica)
    """
    if not mail.de:
        return
    from app.services.acuse import send_aclaracion, send_acuse
    from app.services.automatizacion import get_automatizacion

    flags = get_automatizacion(db)
    datos = mail.datos_extraidos_ia or {}
    try:
        if datos.get("requiere_aclaracion"):
            if flags["aclaracion_automatica"] and datos.get("borrador_aclaracion"):
                send_aclaracion(db, gmail, mail)  # type: ignore[arg-type]
        elif flags["acuse_automatico"]:
            send_acuse(db, gmail, mail)  # type: ignore[arg-type]
    except Exception:  # noqa: BLE001 - la respuesta no debe cortar el procesamiento
        logger.exception("No se pudo enviar la respuesta automática del mail %s", mail.id)
