"""Seguimiento diario: genera avisos in-app de oportunidades que necesitan acción.

Reglas (uso comercial diario):
- Vencida: la oportunidad sigue abierta y su fecha_limite (validez) ya pasó.
- Sin avance: la oportunidad no tiene movimiento hace N días o más.

Se avisa al vendedor asignado. Dedupe por día: si ya se creó hoy una notificación
con el mismo mensaje para ese usuario, no se repite (el job puede correr varias veces).
"""

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.db.models.notificaciones import Notificacion
from app.db.models.oportunidades import ESTADOS_CERRADOS, Oportunidad
from app.db.models.tareas import Tarea
from app.services.notificaciones import crear_notificacion

# Estados cerrados: no se siguen.
_TERMINALES = set(ESTADOS_CERRADOS)

# Días sin movimiento a partir de los cuales se avisa (pedido: 3-4 días).
DIAS_SIN_AVANCE = 3


def _ya_notificado_hoy(db: Session, usuario_id: int, mensaje: str, inicio_dia: datetime) -> bool:
    return (
        db.scalar(
            select(Notificacion.id).where(
                Notificacion.usuario_id == usuario_id,
                Notificacion.mensaje == mensaje,
                Notificacion.fecha_creacion >= inicio_dia,
            )
        )
        is not None
    )


def generar_notificaciones_seguimiento(db: Session) -> int:
    """Crea las notificaciones de seguimiento del día. Devuelve cuántas creó."""
    ahora = datetime.now(timezone.utc)
    hoy = ahora.date()
    inicio_dia = datetime(hoy.year, hoy.month, hoy.day, tzinfo=timezone.utc)

    opps = db.scalars(
        select(Oportunidad)
        .where(
            Oportunidad.vendedor_id.is_not(None),
            Oportunidad.estado.not_in(_TERMINALES),
        )
        .options(selectinload(Oportunidad.cliente))
    )

    creadas = 0
    for o in opps:
        cliente = o.cliente.razon_social if o.cliente else f"oportunidad #{o.id}"
        link = f"/oportunidades?op={o.id}"
        avisos: list[str] = []

        if o.fecha_limite and o.fecha_limite < hoy:
            avisos.append(
                f"Vencida: {cliente} venció el {o.fecha_limite:%d/%m}. Seguí o cerrala."
            )

        # SQLite (tests) devuelve el datetime sin tz; lo normalizamos a UTC.
        ultimo = o.fecha_ultimo_movimiento
        if ultimo.tzinfo is None:
            ultimo = ultimo.replace(tzinfo=timezone.utc)
        dias = (ahora - ultimo).days
        if dias >= DIAS_SIN_AVANCE:
            avisos.append(f"Sin avance hace {dias} días: {cliente}.")

        for mensaje in avisos:
            if not _ya_notificado_hoy(db, o.vendedor_id, mensaje, inicio_dia):
                crear_notificacion(db, usuario_id=o.vendedor_id, mensaje=mensaje, link=link)
                creadas += 1

    if creadas:
        db.commit()
    return creadas


def disparar_recordatorios(db: Session) -> int:
    """Crea la notificación de los recordatorios de tareas cuya hora ya llegó
    (y que no se avisaron todavía). Devuelve cuántos disparó."""
    ahora = datetime.now(timezone.utc)
    tareas = db.scalars(
        select(Tarea).where(
            Tarea.completada.is_(False),
            Tarea.recordatorio.is_not(None),
            Tarea.recordatorio <= ahora,
            Tarea.recordatorio_notificado.is_(False),
        )
    )
    disparados = 0
    for t in tareas:
        crear_notificacion(
            db,
            usuario_id=t.usuario_id,
            mensaje=f"Recordatorio: {t.titulo}",
            link="/tareas",
        )
        t.recordatorio_notificado = True
        disparados += 1
    if disparados:
        db.commit()
    return disparados
