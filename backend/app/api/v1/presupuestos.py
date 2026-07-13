"""Presupuestos: armador de cotizaciones y generación del PDF."""

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_user
from app.core.exceptions import NotFoundError
from app.db.models.oportunidades import Oportunidad
from app.db.models.presupuestos import Presupuesto
from app.db.models.solicitudes_compras import SolicitudCompras
from app.db.models.usuarios import Usuario
from app.db.session import get_db
from app.schemas.presupuesto import PresupuestoCreate, PresupuestoRead, PresupuestoUpdate
from app.services.presupuestos import (
    actualizar_presupuesto,
    crear_desde_solicitud,
    crear_presupuesto,
    render_pdf,
)

router = APIRouter(prefix="/presupuestos", tags=["presupuestos"])

_RELATIONS = (
    selectinload(Presupuesto.items),
    selectinload(Presupuesto.oportunidad).selectinload(Oportunidad.cliente),
)


def _get_loaded(db: Session, presupuesto_id: int) -> Presupuesto:
    presupuesto = db.get(Presupuesto, presupuesto_id, options=list(_RELATIONS))
    if presupuesto is None:
        raise NotFoundError("Presupuesto no encontrado")
    return presupuesto


@router.get("", response_model=list[PresupuestoRead])
def list_presupuestos(
    oportunidad_id: int | None = None,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
) -> list[Presupuesto]:
    query = select(Presupuesto).options(*_RELATIONS).order_by(Presupuesto.id.desc())
    if oportunidad_id is not None:
        query = query.where(Presupuesto.oportunidad_id == oportunidad_id)
    return list(db.scalars(query))


@router.post("", response_model=PresupuestoRead, status_code=201)
def create_presupuesto(
    body: PresupuestoCreate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
) -> Presupuesto:
    """Crea un presupuesto (borrador) y avanza la oportunidad a 'presupuestada'."""
    if db.get(Oportunidad, body.oportunidad_id) is None:
        raise HTTPException(status_code=404, detail="La oportunidad no existe")
    presupuesto = crear_presupuesto(db, body)
    return _get_loaded(db, presupuesto.id)


@router.post("/desde-solicitud/{solicitud_id}", response_model=PresupuestoRead, status_code=201)
def create_desde_solicitud(
    solicitud_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
) -> Presupuesto:
    """Crea un presupuesto pre-llenado con la respuesta de Compras ya parseada."""
    solicitud = db.get(
        SolicitudCompras,
        solicitud_id,
        options=[selectinload(SolicitudCompras.respuestas)],
    )
    if solicitud is None:
        raise HTTPException(status_code=404, detail="La solicitud no existe")
    try:
        presupuesto = crear_desde_solicitud(db, solicitud)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return _get_loaded(db, presupuesto.id)


@router.get("/{presupuesto_id}", response_model=PresupuestoRead)
def get_presupuesto(
    presupuesto_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
) -> Presupuesto:
    return _get_loaded(db, presupuesto_id)


@router.patch("/{presupuesto_id}", response_model=PresupuestoRead)
def update_presupuesto(
    presupuesto_id: int,
    body: PresupuestoUpdate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
) -> Presupuesto:
    presupuesto = _get_loaded(db, presupuesto_id)
    actualizar_presupuesto(db, presupuesto, body)
    return _get_loaded(db, presupuesto_id)


@router.delete("/{presupuesto_id}", status_code=204)
def delete_presupuesto(
    presupuesto_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
) -> Response:
    presupuesto = _get_loaded(db, presupuesto_id)
    for item in list(presupuesto.items):
        db.delete(item)
    db.delete(presupuesto)
    db.commit()
    return Response(status_code=204)


@router.get("/{presupuesto_id}/pdf")
def descargar_pdf(
    presupuesto_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
) -> FileResponse:
    """Genera el PDF con los datos actuales y lo devuelve para descargar/ver."""
    presupuesto = _get_loaded(db, presupuesto_id)
    try:
        ruta: Path = render_pdf(db, presupuesto)
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc
    return FileResponse(
        str(ruta), media_type="application/pdf", filename=f"{presupuesto.codigo}.pdf"
    )
