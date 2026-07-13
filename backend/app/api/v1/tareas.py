"""Tareas / to-do del vendedor logueado (agenda personal)."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Response
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_user
from app.core.exceptions import NotFoundError
from app.db.models.tareas import Tarea
from app.db.models.usuarios import Usuario
from app.db.session import get_db
from app.schemas.tarea import TareaCreate, TareaRead, TareaUpdate

router = APIRouter(prefix="/tareas", tags=["tareas"])

_RELATIONS = (
    selectinload(Tarea.cliente),
    selectinload(Tarea.oportunidad),
    selectinload(Tarea.usuario),
)


def _get_propia(db: Session, tarea_id: int, usuario_id: int) -> Tarea:
    tarea = db.get(Tarea, tarea_id, options=list(_RELATIONS))
    if tarea is None or tarea.usuario_id != usuario_id:
        raise NotFoundError("Tarea no encontrada")
    return tarea


@router.get("", response_model=list[TareaRead])
def list_tareas(
    completada: bool | None = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> list[Tarea]:
    """Tareas del usuario logueado. Pendientes primero, por vencimiento."""
    query = select(Tarea).where(Tarea.usuario_id == current_user.id).options(*_RELATIONS)
    if completada is not None:
        query = query.where(Tarea.completada.is_(completada))
    query = query.order_by(
        Tarea.completada.asc(),
        Tarea.fecha_vencimiento.asc().nullslast(),
        Tarea.id.desc(),
    )
    return list(db.scalars(query))


@router.post("", response_model=TareaRead, status_code=201)
def create_tarea(
    body: TareaCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> Tarea:
    tarea = Tarea(**body.model_dump(), usuario_id=current_user.id)
    if tarea.completada:
        tarea.fecha_completada = datetime.now(timezone.utc)
    db.add(tarea)
    db.commit()
    return _get_propia(db, tarea.id, current_user.id)


@router.patch("/{tarea_id}", response_model=TareaRead)
def update_tarea(
    tarea_id: int,
    body: TareaUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> Tarea:
    tarea = _get_propia(db, tarea_id, current_user.id)
    data = body.model_dump(exclude_unset=True)
    # Al (des)marcar completada, registrar/limpiar la fecha.
    if "completada" in data:
        tarea.fecha_completada = datetime.now(timezone.utc) if data["completada"] else None
    # Si cambió el recordatorio, habilitarlo para volver a avisar.
    if "recordatorio" in data and data["recordatorio"] != tarea.recordatorio:
        tarea.recordatorio_notificado = False
    for campo, valor in data.items():
        setattr(tarea, campo, valor)
    db.commit()
    return _get_propia(db, tarea_id, current_user.id)


@router.delete("/{tarea_id}", status_code=204)
def delete_tarea(
    tarea_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> Response:
    tarea = _get_propia(db, tarea_id, current_user.id)
    db.delete(tarea)
    db.commit()
    return Response(status_code=204)
