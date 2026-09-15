"""Sync del buzón completo a la bandeja del CRM (inbox tipo Gmail).

A diferencia del poll comercial (`gmail_poller`), esto NO filtra por dominio ni
pasa por la IA: trae TODOS los mails de la ventana (entrantes y enviados) y los
guarda/actualiza como filas `Mail` con dueño de casilla + estado leído + carpeta.
La IA queda para después, a demanda, al crear una oportunidad desde un mail.

Es idempotente: `gmail_message_id` es único, así que re-sincronizar solo refresca
el estado (leído/carpeta) de los que ya estaban. No baja bytes de adjuntos.
"""

import logging
from typing import Any, Protocol

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models.mails import DireccionMail, Mail
from app.db.models.usuarios import Usuario

logger = logging.getLogger(__name__)

# Ventana de sincronización (días). Configurable por usuario en
# preferencias.inbox_sync_dias; se acota a [1, 7] para no inflar la DB.
_DIAS_DEFAULT = 3
_DIAS_MAX = 7
# Tope de mensajes por corrida (la ventana es chica; es una red de seguridad).
_MAX_MENSAJES = 200


class GmailLike(Protocol):
    def list_message_ids(self, query: str, max_results: int = 25) -> list[str]: ...
    def get_message(self, message_id: str, with_attachments: bool = True) -> dict[str, Any]: ...


def dias_ventana(usuario: Usuario) -> int:
    """Días de buzón a sincronizar para el usuario (default 3, tope 7)."""
    prefs = usuario.preferencias or {}
    try:
        dias = int(prefs.get("inbox_sync_dias", _DIAS_DEFAULT))
    except (TypeError, ValueError):
        dias = _DIAS_DEFAULT
    return min(_DIAS_MAX, max(1, dias))


def _carpeta_y_direccion(labels: list[str]) -> tuple[str, DireccionMail]:
    """Deriva carpeta del CRM y dirección desde los labels de Gmail."""
    if "SENT" in labels:
        return "enviados", DireccionMail.saliente
    if "INBOX" in labels:
        return "entrada", DireccionMail.entrante
    # Ni INBOX ni SENT: en Gmail está archivado -> carpeta Archivo (solo lectura).
    return "archivo", DireccionMail.entrante


def sync_inbox_for_user(
    db: Session,
    gmail: GmailLike,
    usuario: Usuario,
    *,
    dias: int | None = None,
    max_mensajes: int = _MAX_MENSAJES,
) -> dict[str, int | str | None]:
    """Sincroniza el buzón del usuario (entrada + enviados) de los últimos N días.

    Devuelve {"nuevos", "actualizados", "errores", "ultimo_error"}.
    """
    ventana = dias if dias is not None else dias_ventana(usuario)
    ventana = min(_DIAS_MAX, max(1, ventana))
    query = f"newer_than:{ventana}d (in:inbox OR in:sent)"

    ids = gmail.list_message_ids(query, max_results=max_mensajes)
    resultado: dict[str, int | str | None] = {
        "nuevos": 0,
        "actualizados": 0,
        "errores": 0,
        "ultimo_error": None,
    }
    if not ids:
        return resultado

    existentes = {
        m.gmail_message_id: m
        for m in db.scalars(select(Mail).where(Mail.gmail_message_id.in_(ids)))
    }

    for mid in ids:
        try:
            msg = gmail.get_message(mid, with_attachments=False)
            labels = msg.get("labels") or []
            carpeta, direccion = _carpeta_y_direccion(labels)
            leido = "UNREAD" not in labels

            existente = existentes.get(mid)
            if existente is not None:
                # Ya lo tenía el pipeline comercial: solo reflejamos estado/dueño.
                existente.leido = leido
                existente.carpeta = carpeta
                if existente.usuario_id is None:
                    existente.usuario_id = usuario.id
                resultado["actualizados"] += 1  # type: ignore[operator]
            else:
                db.add(
                    Mail(
                        gmail_message_id=msg.get("message_id"),
                        gmail_thread_id=msg.get("thread_id"),
                        rfc_message_id=msg.get("rfc_message_id"),
                        direccion=direccion,
                        de=msg.get("de"),
                        para=msg.get("para"),
                        asunto=msg.get("asunto"),
                        cuerpo=msg.get("cuerpo") or "",
                        fecha=msg.get("fecha"),
                        leido=leido,
                        carpeta=carpeta,
                        usuario_id=usuario.id,
                    )
                )
                resultado["nuevos"] += 1  # type: ignore[operator]
            db.commit()
        except Exception as exc:  # noqa: BLE001 - un mail malo no corta el lote
            db.rollback()
            resultado["errores"] += 1  # type: ignore[operator]
            resultado["ultimo_error"] = str(exc)[:200]
            logger.exception("Error sincronizando el mail %s al inbox; se omite", mid)
    return resultado
