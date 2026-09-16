"""Limpieza automática de la bandeja: borra propuestas y descartados viejos.

- Propuestas (oportunidades pendientes de revisión) sin revisar hace más de
  ``DIAS_PROPUESTAS`` días: se borran igual que un "Descartar" a mano (la
  oportunidad se elimina y sus mails quedan marcados para no re-ingresar).
- Descartados por la IA de más de ``DIAS_DESCARTADOS`` días: se borran. Es
  inofensivo respecto a reprocesar, porque el polling solo mira `newer_than:2d`:
  a los 10 días esos mails ya no se vuelven a bajar de todos modos.

Lo dispara el scheduler una vez al día.
"""

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.db.models.adjuntos import Adjunto
from app.db.models.mails import Mail
from app.db.models.mails_descartados import MailDescartado
from app.db.models.oportunidades import Oportunidad
from app.services.borrado import eliminar_oportunidades

logger = logging.getLogger(__name__)

DIAS_PROPUESTAS = 10
DIAS_DESCARTADOS = 10
DIAS_INBOX = 15


def limpiar_propuestas_viejas(db: Session, dias: int = DIAS_PROPUESTAS) -> int:
    """Borra las propuestas (pendientes de revisión) más viejas que `dias`.
    Devuelve cuántas borró."""
    corte = datetime.now(timezone.utc) - timedelta(days=dias)
    ids = list(
        db.scalars(
            select(Oportunidad.id).where(
                Oportunidad.pendiente_revision.is_(True),
                Oportunidad.fecha_creacion < corte,
            )
        )
    )
    if ids:
        eliminar_oportunidades(db, ids)
        db.commit()
    return len(ids)


def limpiar_descartados_viejos(db: Session, dias: int = DIAS_DESCARTADOS) -> int:
    """Borra los mails descartados por la IA más viejos que `dias` (por
    fecha de registro). Devuelve cuántos borró."""
    corte = datetime.now(timezone.utc) - timedelta(days=dias)
    filas = list(
        db.scalars(select(MailDescartado).where(MailDescartado.created_at < corte))
    )
    for fila in filas:
        db.delete(fila)
    if filas:
        db.commit()
    return len(filas)


def limpiar_inbox_viejo(db: Session, dias: int = DIAS_INBOX) -> int:
    """Borra mails RECIBIDOS de la bandeja más viejos que `dias` que NO estén
    vinculados a ninguna oportunidad (estén abiertos o no).

    Lo único que protege a un mail es estar vinculado a una oportunidad. Se
    limitan a los recibidos (Entrada/Archivo): los Enviados se conservan porque
    guardan el estado de apertura (tracking) y son el registro de salida. No hace
    falta marcarlos como 'eliminado_manual' porque ya están fuera de la ventana
    del sync."""
    corte = datetime.now(timezone.utc) - timedelta(days=dias)
    cond = (
        Mail.carpeta.in_(("entrada", "archivo")),  # recibidos (no Enviados)
        Mail.oportunidad_id.is_(None),  # no vinculado a oportunidad
        func.coalesce(Mail.fecha, Mail.created_at) < corte,
    )
    ids = list(db.scalars(select(Mail.id).where(*cond)))
    if not ids:
        return 0
    # Defensivo: los del inbox no suelen tener adjuntos guardados, pero por si acaso.
    db.execute(delete(Adjunto).where(Adjunto.mail_id.in_(ids)))
    db.execute(delete(Mail).where(Mail.id.in_(ids)))
    db.commit()
    return len(ids)


def limpiar_bandeja(db: Session) -> dict[str, int]:
    """Corre toda la limpieza del día. Devuelve el conteo por tipo."""
    propuestas = limpiar_propuestas_viejas(db)
    descartados = limpiar_descartados_viejos(db)
    inbox = limpiar_inbox_viejo(db)
    return {"propuestas": propuestas, "descartados": descartados, "inbox": inbox}
