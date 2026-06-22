"""CRUD endpoints for oportunidades."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.exceptions import NotFoundError
from app.db.models.oportunidades import Oportunidad
from app.db.models.usuarios import Usuario
from app.db.session import get_db
from app.schemas.oportunidad import (
    OportunidadCreate,
    OportunidadRead,
    OportunidadUpdate,
)

router = APIRouter(prefix="/oportunidades", tags=["oportunidades"])


@router.get("", response_model=list[OportunidadRead])
def list_oportunidades(
    db: Session = Depends(get_db), _: Usuario = Depends(get_current_user)
) -> list[Oportunidad]:
    return list(
        db.scalars(select(Oportunidad).order_by(Oportunidad.fecha_ultimo_movimiento.desc()))
    )


@router.post("", response_model=OportunidadRead, status_code=201)
def create_oportunidad(
    body: OportunidadCreate, db: Session = Depends(get_db), _: Usuario = Depends(get_current_user)
) -> Oportunidad:
    oportunidad = Oportunidad(**body.model_dump())
    db.add(oportunidad)
    db.commit()
    db.refresh(oportunidad)
    return oportunidad


@router.get("/{oportunidad_id}", response_model=OportunidadRead)
def get_oportunidad(
    oportunidad_id: int, db: Session = Depends(get_db), _: Usuario = Depends(get_current_user)
) -> Oportunidad:
    oportunidad = db.get(Oportunidad, oportunidad_id)
    if oportunidad is None:
        raise NotFoundError("Oportunidad no encontrada")
    return oportunidad


@router.patch("/{oportunidad_id}", response_model=OportunidadRead)
def update_oportunidad(
    oportunidad_id: int,
    body: OportunidadUpdate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
) -> Oportunidad:
    oportunidad = db.get(Oportunidad, oportunidad_id)
    if oportunidad is None:
        raise NotFoundError("Oportunidad no encontrada")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(oportunidad, field, value)
    oportunidad.fecha_ultimo_movimiento = datetime.now(timezone.utc)
    db.commit()
    db.refresh(oportunidad)
    return oportunidad
