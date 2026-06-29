"""Configuración editable desde la UI (flags de automatización)."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.models.usuarios import Usuario
from app.db.session import get_db
from app.services.automatizacion import get_automatizacion, set_automatizacion

router = APIRouter(prefix="/configuracion", tags=["configuracion"])


class Automatizacion(BaseModel):
    acuse_automatico: bool
    aclaracion_automatica: bool


class AutomatizacionUpdate(BaseModel):
    acuse_automatico: bool | None = None
    aclaracion_automatica: bool | None = None


@router.get("/automatizacion", response_model=Automatizacion)
def leer_automatizacion(
    db: Session = Depends(get_db), _: Usuario = Depends(get_current_user)
) -> dict[str, bool]:
    return get_automatizacion(db)


@router.put("/automatizacion", response_model=Automatizacion)
def actualizar_automatizacion(
    body: AutomatizacionUpdate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
) -> dict[str, bool]:
    return set_automatizacion(
        db,
        acuse_automatico=body.acuse_automatico,
        aclaracion_automatica=body.aclaracion_automatica,
    )
