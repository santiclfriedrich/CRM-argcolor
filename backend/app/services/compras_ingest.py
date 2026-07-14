"""Auto-ingesta de las respuestas de Compras desde el hilo de Gmail.

Por cada solicitud enviada (con hilo de Gmail), lee el hilo desde la casilla del
solicitante, detecta las respuestas que NO son del propio vendedor, las parsea con
la IA (draft_quote) y crea la RespuestaCompras. Dedup por gmail_message_id.
"""

import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.db.models.respuestas_compras import RespuestaCompras
from app.db.models.solicitudes_compras import EstadoSolicitud, SolicitudCompras
from app.integrations.ai.base import AIProvider
from app.services.notificaciones import crear_notificacion

logger = logging.getLogger(__name__)


def ingerir_respuestas_compras(db: Session, ai: AIProvider) -> int:
    """Revisa los hilos de las solicitudes enviadas y ingiere las respuestas de
    Compras nuevas. Devuelve cuántas respuestas creó."""
    from app.core.crypto import decrypt
    from app.integrations.gmail.client import GmailClient

    solicitudes = list(
        db.scalars(
            select(SolicitudCompras)
            .where(
                SolicitudCompras.gmail_thread_id.is_not(None),
                SolicitudCompras.estado == EstadoSolicitud.enviada,
            )
            .options(
                selectinload(SolicitudCompras.solicitante),
                selectinload(SolicitudCompras.respuestas),
                selectinload(SolicitudCompras.oportunidad),
            )
        )
    )

    clientes: dict[int, object] = {}
    creadas = 0

    for sol in solicitudes:
        vendedor = sol.solicitante
        if vendedor is None or not vendedor.gmail_refresh_token:
            continue

        gmail = clientes.get(vendedor.id)
        if gmail is None:
            token = decrypt(vendedor.gmail_refresh_token)
            if not token:
                continue
            gmail = GmailClient(refresh_token=token)
            clientes[vendedor.id] = gmail

        try:
            mensajes = gmail.get_thread(sol.gmail_thread_id)  # type: ignore[attr-defined]
        except Exception:  # noqa: BLE001 - un hilo roto no corta el resto
            logger.exception("No se pudo leer el hilo de la solicitud %s", sol.id)
            continue

        ya = {r.gmail_message_id for r in sol.respuestas if r.gmail_message_id}
        vendedor_email = (vendedor.email or "").lower()

        for m in mensajes:
            de = (m.get("de") or "").lower()
            mid = m.get("message_id")
            cuerpo = (m.get("cuerpo") or "").strip()
            # Salteamos: mensajes del propio vendedor, sin id, ya ingeridos o vacíos.
            if not mid or mid in ya or not cuerpo:
                continue
            if vendedor_email and vendedor_email in de:
                continue
            try:
                draft = ai.draft_quote(cuerpo)
            except Exception:  # noqa: BLE001 - error de IA (cuota): reintenta después
                logger.exception("No se pudo parsear la respuesta de Compras (sol %s)", sol.id)
                continue

            db.add(
                RespuestaCompras(
                    solicitud_compras_id=sol.id,
                    gmail_message_id=mid,
                    contenido_raw=cuerpo,
                    datos_parseados_ia=draft.model_dump(),
                    notas_compras=draft.notas,
                )
            )
            ya.add(mid)
            creadas += 1

            if sol.estado == EstadoSolicitud.enviada:
                sol.estado = EstadoSolicitud.respondida
            if sol.fecha_respuesta is None:
                sol.fecha_respuesta = datetime.now(timezone.utc)

            cliente = (
                sol.oportunidad.cliente.razon_social
                if sol.oportunidad and sol.oportunidad.cliente
                else f"solicitud #{sol.id}"
            )
            crear_notificacion(
                db,
                usuario_id=vendedor.id,
                mensaje=f"Compras respondió: {cliente}. Revisá para armar el presupuesto.",
                link="/solicitudes",
            )

        db.commit()

    return creadas
