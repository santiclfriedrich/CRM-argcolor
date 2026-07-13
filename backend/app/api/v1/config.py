"""Configuración editable desde la UI (flags de automatización, destinatarios)."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.models.usuarios import Usuario
from app.db.session import get_db
from app.services.automatizacion import get_automatizacion, set_automatizacion
from app.services.solicitudes import (
    get_destinatarios_compras,
    set_destinatarios_compras,
)

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


class DestinatariosCompras(BaseModel):
    """Destinatarios del mail a Compras (to = principal, cc = en copia)."""

    to: EmailStr | None = None
    cc: list[EmailStr] = []


@router.get("/compras", response_model=DestinatariosCompras)
def leer_compras(
    db: Session = Depends(get_db), _: Usuario = Depends(get_current_user)
) -> dict:
    return get_destinatarios_compras(db)


@router.put("/compras", response_model=DestinatariosCompras)
def actualizar_compras(
    body: DestinatariosCompras,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
) -> dict:
    return set_destinatarios_compras(
        db,
        to=str(body.to) if body.to else None,
        cc=[str(e) for e in body.cc],
    )
