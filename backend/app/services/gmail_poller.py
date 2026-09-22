"""Polling de la casilla comercial: trae mails nuevos y los mete al pipeline.

Desacoplado del cliente concreto (recibe cualquier objeto con
list_message_ids/get_message) para poder testearlo con un fake.
"""

import logging
import re
import time
from typing import Any, Protocol

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.db.models.dominios_cliente import DominioCliente
from app.db.models.mails import Mail
from app.db.models.mails_descartados import MailDescartado
from app.db.models.usuarios import Usuario
from app.integrations.ai.base import AIProvider
from app.services.ingest import process_incoming_email

logger = logging.getLogger(__name__)

# Remitentes automáticos que no vale la pena procesar (ni gastar IA en clasificar).
_REMITENTE_IGNORADO = re.compile(
    r"no[-_.]?reply|noreply|no[-_.]?responder|donotreply|do-not-reply|"
    r"notificac|notification|mailer-daemon|postmaster|bounce",
    re.IGNORECASE,
)


class GmailLike(Protocol):
    def list_message_ids(self, query: str, max_results: int = 25) -> list[str]: ...
    def get_message(self, message_id: str) -> dict[str, Any]: ...


# Cache en proceso de los dominios de clientes. El poller corre seguido pero los
# dominios casi no cambian; leer la tabla entera en cada corrida es egress al
# pedo contra Neon. Un dominio recién cargado tarda a lo sumo _DOMINIOS_TTL en
# entrar a la query (aceptable para la bandeja). El backend es monoproceso.
_DOMINIOS_TTL = 600.0  # segundos
_dominios_cache: tuple[float, list[str]] | None = None


def reset_dominios_cache() -> None:
    """Invalida el cache de dominios: la próxima corrida los relee de la DB.

    Se llama al alta/baja/edición de un dominio para que un cliente nuevo entre
    a la query de la bandeja en el próximo poll, sin esperar el TTL.
    """
    global _dominios_cache
    _dominios_cache = None


def _dominios_clientes(db: Session) -> list[str]:
    global _dominios_cache
    ahora = time.monotonic()
    if _dominios_cache is not None and ahora - _dominios_cache[0] < _DOMINIOS_TTL:
        return _dominios_cache[1]
    dominios = sorted(
        {
            d.strip().lower()
            for d in db.scalars(select(DominioCliente.dominio))
            if d and d.strip()
        }
    )
    _dominios_cache = (ahora, dominios)
    return dominios


def build_poll_query(db: Session) -> str:
    """Arma la query de Gmail (enfoque B): clientes conocidos + etiqueta comodín.

    Lee automáticamente los mails de dominios ya cargados en el CRM y deja la
    etiqueta como red de seguridad para prospectos nuevos todavía sin cargar.
    Excluye los propios enviados con ``-from:me`` (no interesan como pedidos).
    Resultado: ``newer_than:2d -from:me (label:crm OR from:cli1.com ...)``.
    """
    base = settings.GMAIL_QUERY.strip()
    label = settings.GMAIL_LABEL.strip()

    dominios = _dominios_clientes(db)

    # -from:me: no procesar los mails que envió el propio dueño de la casilla.
    prefijo = f"{base} -from:me".strip() if base else "-from:me"

    clauses: list[str] = []
    if label:
        clauses.append(f"label:{label}")
    clauses.extend(f"from:{dom}" for dom in dominios)

    if not clauses:
        return prefijo
    selector = " OR ".join(clauses)
    return f"{prefijo} ({selector})"


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
            # Filtro barato ANTES de la IA: remitentes automáticos (no-reply, etc.).
            # Se registra como descartado para no re-descargarlo en cada ciclo.
            if _REMITENTE_IGNORADO.search(msg.get("de") or ""):
                db.add(
                    MailDescartado(
                        gmail_message_id=msg.get("message_id"),
                        categoria="remitente_ignorado",
                        de=msg.get("de"),
                        asunto=msg.get("asunto"),
                    )
                )
                db.commit()
                continue
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
                rfc_message_id=msg.get("rfc_message_id"),
                images=msg.get("images"),
                default_vendedor_id=default_vendedor_id,
                es_automatico=bool(msg.get("es_automatico")),
                referencias=msg.get("referencias"),
                documentos=msg.get("documentos"),
                revisar=True,  # auto-ingesta: entra como propuesta a revisar
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


def poll_user_mailbox(
    db: Session, ai: AIProvider, usuario: Usuario
) -> dict[str, int | str | None]:
    """Pollea SOLO la casilla del usuario dado, con su propio refresh token.

    Es lo que usa la sincronización manual (botón "Sincronizar"): cada vendedor
    lee ÚNICAMENTE su propia casilla y los mails quedan a su nombre. Así el sync
    de un usuario nunca toca la casilla de otro ni le atribuye mails ajenos.
    """
    from app.core.crypto import decrypt
    from app.integrations.gmail.client import GmailClient

    if not usuario.sync_mail_activo:
        return {
            "procesados": 0,
            "errores": 0,
            "ultimo_error": (
                "Tu sincronización de mails está pausada. Activala en "
                "Configuración para volver a recibir mails en la bandeja."
            ),
        }
    if not usuario.gmail_refresh_token:
        return {
            "procesados": 0,
            "errores": 0,
            "ultimo_error": (
                "No tenés Gmail conectado. Conectalo desde tu perfil para "
                "sincronizar tu casilla."
            ),
        }
    token = decrypt(usuario.gmail_refresh_token)
    if not token:
        return {
            "procesados": 0,
            "errores": 0,
            "ultimo_error": "No se pudo leer tu token de Gmail. Reconectá tu cuenta.",
        }
    query = build_poll_query(db)
    gmail = GmailClient(refresh_token=token)
    resultado = poll_once(db, ai, gmail, query=query, default_vendedor_id=usuario.id)
    _sync_inbox_seguro(db, gmail, usuario)
    return resultado


def _sync_inbox_seguro(db: Session, gmail: object, usuario: Usuario) -> None:
    """Sincroniza el buzón completo a la bandeja (inbox del CRM), aislado: si
    falla, no rompe el poll comercial."""
    from app.services.gmail_inbox import sync_inbox_for_user

    try:
        r = sync_inbox_for_user(db, gmail, usuario)  # type: ignore[arg-type]
        if r["nuevos"] or r["actualizados"]:
            logger.info(
                "Inbox sync (%s): %s nuevos, %s actualizados",
                usuario.email,
                r["nuevos"],
                r["actualizados"],
            )
    except Exception:  # noqa: BLE001 - el inbox no debe cortar el poll comercial
        db.rollback()
        logger.exception("Falló el sync de inbox de %s", usuario.email)


def poll_all_mailboxes(
    db: Session, ai: AIProvider, default_vendedor_id: int | None = None
) -> dict[str, int | str | None]:
    """Sincroniza el INBOX de cada casilla conectada a la bandeja.

    El pipeline comercial (auto-creación de oportunidades como "propuestas") fue
    RETIRADO: ahora las oportunidades se crean a mano desde la bandeja (Fase 4).
    Acá solo se trae el buzón; no se clasifica con IA ni se crean propuestas.
    `ai` se mantiene en la firma por compatibilidad con el scheduler.
    """
    from app.integrations.gmail.client import GmailClient

    total: dict[str, int | str | None] = {"procesados": 0, "errores": 0, "ultimo_error": None}

    if settings.GMAIL_SERVICE_ACCOUNT_FILE:
        # Camino B: impersonación de cada casilla activa vía service account.
        usuarios = list(
            db.scalars(
                select(Usuario).where(
                    Usuario.activo.is_(True), Usuario.sync_mail_activo.is_(True)
                )
            )
        )
        for usuario in usuarios:
            try:
                _sync_inbox_seguro(db, GmailClient(usuario.email), usuario)
            except Exception as exc:  # noqa: BLE001 - una casilla rota no corta el resto
                total["errores"] += 1  # type: ignore[operator]
                total["ultimo_error"] = _humanize_error(exc)
                logger.exception("Error sincronizando la casilla de %s", usuario.email)
        return total

    # Camino C (por cuenta): cada vendedor conectó su Gmail (refresh token propio).
    conectados = list(
        db.scalars(
            select(Usuario).where(
                Usuario.activo.is_(True),
                Usuario.sync_mail_activo.is_(True),
                Usuario.gmail_refresh_token.is_not(None),
            )
        )
    )
    if conectados:
        from app.core.crypto import decrypt

        for usuario in conectados:
            try:
                token = decrypt(usuario.gmail_refresh_token)
                if not token:
                    continue
                _sync_inbox_seguro(db, GmailClient(refresh_token=token), usuario)
            except Exception as exc:  # noqa: BLE001 - una casilla rota no corta el resto
                total["errores"] += 1  # type: ignore[operator]
                total["ultimo_error"] = _humanize_error(exc)
                logger.exception("Error sincronizando la casilla de %s", usuario.email)
    return total


def _maybe_acuse(db: Session, gmail: object, mail: Mail) -> None:
    """Respuesta automática según los flags configurables:
    - pedido claro -> acuse de recibo (si acuse_automatico)
    - requiere aclaración -> aclaración al cliente (si aclaracion_automatica)
    """
    if not mail.de:
        return
    # Propuesta pendiente de revisión: no se responde nada hasta que se acepte.
    if mail.oportunidad is not None and mail.oportunidad.pendiente_revision:
        return
    # Respuesta dentro de un hilo existente (sin datos de IA): no lleva acuse.
    if not mail.datos_extraidos_ia:
        return
    # Solo auto-respondemos el PRIMER mail de la oportunidad. Las respuestas de
    # un hilo (aunque la IA las haya re-evaluado en el Slice 5) las sigue el
    # vendedor a mano: evita re-acusar o re-preguntar en loop.
    if mail.oportunidad_id is not None:
        anteriores = db.scalar(
            select(func.count())
            .select_from(Mail)
            .where(Mail.oportunidad_id == mail.oportunidad_id, Mail.id != mail.id)
        )
        if anteriores:
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
