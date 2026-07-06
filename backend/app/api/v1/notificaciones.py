"""Notificaciones in-app del usuario logueado (campana del sidebar)."""

from fastapi import APIRouter, Depends, Response
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.exceptions import NotFoundError
from app.db.models.notificaciones import Notificacion
from app.db.models.usuarios import Usuario
from app.db.session import get_db
from app.schemas.notificacion import NotificacionRead

router = APIRouter(prefix="/notificaciones", tags=["notificaciones"])


@router.get("", response_model=list[NotificacionRead])
def list_notificaciones(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> list[Notificacion]:
    """Últimas notificaciones del usuario (más nuevas primero)."""
    query = (
        select(Notificacion)
        .where(Notificacion.usuario_id == current_user.id)
        .order_by(Notificacion.fecha_creacion.desc())
        .limit(50)
    )
    return list(db.scalars(query))


@router.post("/leer-todas", status_code=204)
def marcar_todas_leidas(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> Response:
    """Marca todas las notificaciones del usuario como leídas."""
    db.execute(
        update(Notificacion)
        .where(Notificacion.usuario_id == current_user.id, Notificacion.leida.is_(False))
        .values(leida=True)
    )
    db.commit()
    return Response(status_code=204)


@router.post("/{noti_id}/leida", status_code=204)
def marcar_leida(
    noti_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> Response:
    """Marca una notificación como leída (solo si es del usuario)."""
    noti = db.get(Notificacion, noti_id)
    if noti is None or noti.usuario_id != current_user.id:
        raise NotFoundError("Notificación no encontrada")
    noti.leida = True
    db.commit()
    return Response(status_code=204)
