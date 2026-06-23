"""CRUD endpoints for solicitudes a Compras (reemplazo del Google Form)."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_user
from app.core.exceptions import NotFoundError
from app.db.models.oportunidades import EstadoOportunidad, Oportunidad
from app.db.models.solicitudes_compras import EstadoSolicitud, SolicitudCompras
from app.db.models.usuarios import Usuario
from app.db.session import get_db
from app.schemas.solicitud import (
    SolicitudCreate,
    SolicitudDetail,
    SolicitudRead,
    SolicitudUpdate,
)
from app.services.solicitudes import build_email_preview

router = APIRouter(prefix="/solicitudes", tags=["solicitudes"])

# Relaciones que exponen los schemas (evita N+1).
_RELATIONS = (
    selectinload(SolicitudCompras.oportunidad).selectinload(Oportunidad.cliente),
    selectinload(SolicitudCompras.solicitante),
)


def _get_loaded(db: Session, solicitud_id: int) -> SolicitudCompras:
    solicitud = db.get(SolicitudCompras, solicitud_id, options=list(_RELATIONS))
    if solicitud is None:
        raise NotFoundError("Solicitud no encontrada")
    return solicitud


def _normalize_ccs(data: dict) -> None:
    """ccs_extra llega como list[EmailStr]; la columna ARRAY espera str planos."""
    if data.get("ccs_extra"):
        data["ccs_extra"] = [str(e) for e in data["ccs_extra"]]


@router.get("", response_model=list[SolicitudRead])
def list_solicitudes(
    estado: EstadoSolicitud | None = None,
    oportunidad_id: int | None = None,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
) -> list[SolicitudCompras]:
    query = select(SolicitudCompras).options(*_RELATIONS)
    if estado is not None:
        query = query.where(SolicitudCompras.estado == estado)
    if oportunidad_id is not None:
        query = query.where(SolicitudCompras.oportunidad_id == oportunidad_id)
    return list(db.scalars(query.order_by(SolicitudCompras.created_at.desc())))


@router.post("", response_model=SolicitudRead, status_code=201)
def create_solicitud(
    body: SolicitudCreate,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
) -> SolicitudCompras:
    oportunidad = db.get(Oportunidad, body.oportunidad_id)
    if oportunidad is None:
        raise NotFoundError("Oportunidad no encontrada")

    data = body.model_dump()
    _normalize_ccs(data)
    now = datetime.now(timezone.utc)
    solicitud = SolicitudCompras(
        **data,
        solicitante_id=user.id,
        fecha_envio=now,
        estado=EstadoSolicitud.enviada,
    )
    db.add(solicitud)

    # Al solicitar a Compras, la oportunidad avanza a "en_compras".
    oportunidad.estado = EstadoOportunidad.en_compras
    oportunidad.fecha_ultimo_movimiento = now

    db.commit()
    return _get_loaded(db, solicitud.id)


@router.get("/{solicitud_id}", response_model=SolicitudDetail)
def get_solicitud(
    solicitud_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
) -> SolicitudDetail:
    solicitud = _get_loaded(db, solicitud_id)
    read = SolicitudRead.model_validate(solicitud)
    preview = build_email_preview(solicitud, db)
    return SolicitudDetail(**read.model_dump(), email_preview=preview)


@router.patch("/{solicitud_id}", response_model=SolicitudRead)
def update_solicitud(
    solicitud_id: int,
    body: SolicitudUpdate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
) -> SolicitudCompras:
    solicitud = db.get(SolicitudCompras, solicitud_id)
    if solicitud is None:
        raise NotFoundError("Solicitud no encontrada")

    data = body.model_dump(exclude_unset=True)
    _normalize_ccs(data)
    for field, value in data.items():
        setattr(solicitud, field, value)

    # Al marcar "respondida" registramos la fecha de respuesta si falta.
    if body.estado == EstadoSolicitud.respondida and solicitud.fecha_respuesta is None:
        solicitud.fecha_respuesta = datetime.now(timezone.utc)

    db.commit()
    return _get_loaded(db, solicitud_id)
