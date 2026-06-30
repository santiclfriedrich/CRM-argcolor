"""Polling de la casilla comercial: trae mails nuevos y los mete al pipeline.

Desacoplado del cliente concreto (recibe cualquier objeto con
list_message_ids/get_message) para poder testearlo con un fake.
"""

import logging
from typing import Any, Protocol

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.db.models.dominios_cliente import DominioCliente
from app.db.models.mails import Mail
from app.db.models.mails_descartados import MailDescartado
from app.db.models.usuarios import Usuario
from app.integrations.ai.base import AIProvider
from app.services.ingest import process_incoming_email

logger = logging.getLogger(__name__)


class GmailLike(Protocol):
    def list_message_ids(self, query: str, max_results: int = 25) -> list[str]: ...
    def get_message(self, message_id: str) -> dict[str, Any]: ...


def build_poll_query(db: Session) -> str:
    """Arma la query de Gmail (enfoque B): clientes conocidos + etiqueta comodín.

    Lee automáticamente los mails de dominios ya cargados en el CRM y deja la
    etiqueta como red de seguridad para prospectos nuevos todavía sin cargar.
    Resultado: ``newer_than:2d (label:crm OR from:cli1.com OR from:cli2.com)``.
    """
    base = settings.GMAIL_QUERY.strip()
    label = settings.GMAIL_LABEL.strip()

    dominios = sorted(
        {
            d.strip().lower()
            for d in db.scalars(select(DominioCliente.dominio))
            if d and d.strip()
        }
    )

    clauses: list[str] = []
    if label:
        clauses.append(f"label:{label}")
    clauses.extend(f"from:{dom}" for dom in dominios)

    if not clauses:
        return base
    selector = " OR ".join(clauses)
    return f"{base} ({selector})" if base else f"({selector})"


def _humanize_error(exc: Exception) -> str:
    """Traduce errores técnicos comunes a algo accionable para el usuario."""
    text = str(exc)
    if "RESOURCE_EXHAUSTED" in text or "429" in text:
        return (
            "Se alcanzó el límite de cuota de la IA (Gemini). "
            "Esperá al reset diario o activá billing en el proyecto de Google AI."
        )
    return text[:200]


def poll_once(
    db: Session,
    ai: AIProvider,
    gmail: GmailLike,
    query: str | None = None,
    default_vendedor_id: int | None = None,
) -> dict[str, int | str | None]:
    """Procesa los mails nuevos (no vistos antes).

    Devuelve {"procesados", "errores", "ultimo_error"}: cuántos se crearon,
    cuántos fallaron y un mensaje del último error (para mostrarle al usuario).
    """
    ids = gmail.list_message_ids(query or settings.GMAIL_QUERY)
    if not ids:
        return {"procesados": 0, "errores": 0, "ultimo_error": None}

    # Dedup: ignoramos los ya registrados, sea como mail comercial o descartado.
    existing = set(
        db.scalars(select(Mail.gmail_message_id).where(Mail.gmail_message_id.in_(ids)))
    )
    existing |= set(
        db.scalars(
            select(MailDescartado.gmail_message_id).where(
                MailDescartado.gmail_message_id.in_(ids)
            )
        )
    )
    nuevos = [mid for mid in ids if mid not in existing]

    procesados = 0
    errores = 0
    ultimo_error: str | None = None
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
                images=msg.get("images"),
                default_vendedor_id=default_vendedor_id,
            )
            if mail is None:  # no comercial: descartado, sin oportunidad ni respuesta
                continue
            procesados += 1
            _maybe_acuse(db, gmail, mail)
        except Exception as exc:  # noqa: BLE001 - un mail malo no debe cortar el lote
            db.rollback()
            errores += 1
            ultimo_error = _humanize_error(exc)
            logger.exception("Error procesando el mail %s; se omite", mid)
    return {"procesados": procesados, "errores": errores, "ultimo_error": ultimo_error}


def poll_all_mailboxes(
    db: Session, ai: AIProvider, default_vendedor_id: int | None = None
) -> dict[str, int | str | None]:
    """Pollea todas las casillas configuradas.

    - Camino A: una sola casilla (la del refresh token); usa default_vendedor_id
      (ej. el usuario que disparó el sync) como vendedor por defecto.
    - Camino B: una casilla por cada usuario activo (impersonación); ahí el dueño
      de la casilla manda y se ignora default_vendedor_id.
    Devuelve el acumulado {"procesados", "errores", "ultimo_error"}.
    Importado acá adentro para no acoplar el cliente real en los tests.
    """
    from app.integrations.gmail.client import GmailClient

    query = build_poll_query(db)
    total: dict[str, int | str | None] = {"procesados": 0, "errores": 0, "ultimo_error": None}

    def _merge(parcial: dict[str, int | str | None]) -> None:
        total["procesados"] += parcial["procesados"]  # type: ignore[operator]
        total["errores"] += parcial["errores"]  # type: ignore[operator]
        if parcial["ultimo_error"]:
            total["ultimo_error"] = parcial["ultimo_error"]

    if not settings.GMAIL_SERVICE_ACCOUNT_FILE:
        # Camino A: una casilla; el vendedor por defecto lo define quien sincroniza.
        _merge(
            poll_once(
                db, ai, GmailClient(), query=query, default_vendedor_id=default_vendedor_id
            )
        )
        return total

    usuarios = list(db.scalars(select(Usuario).where(Usuario.activo.is_(True))))
    for usuario in usuarios:
        try:
            gmail = GmailClient(usuario.email)
            _merge(poll_once(db, ai, gmail, query=query, default_vendedor_id=usuario.id))
        except Exception as exc:  # noqa: BLE001 - una casilla rota no corta el resto
            total["errores"] += 1  # type: ignore[operator]
            total["ultimo_error"] = _humanize_error(exc)
            logger.exception("Error polleando la casilla de %s", usuario.email)
    return total


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
