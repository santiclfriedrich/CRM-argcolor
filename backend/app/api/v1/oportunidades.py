"""CRUD endpoints for oportunidades."""

from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_user
from app.core.exceptions import NotFoundError
from app.db.models.oportunidades import EstadoOportunidad, Oportunidad
from app.db.models.usuarios import Usuario
from app.db.session import get_db
from app.schemas.oportunidad import (
    ComentarioCreate,
    OportunidadCreate,
    OportunidadRead,
    OportunidadUpdate,
)
from app.schemas.solicitud import SugerenciaCompras
from app.services.borrado import eliminar_oportunidades
from app.services.solicitudes import sugerir_requerimiento

router = APIRouter(prefix="/oportunidades", tags=["oportunidades"])

# Carga anticipada de las relaciones que expone OportunidadRead (evita N+1).
_RELATIONS = (
    selectinload(Oportunidad.cliente),
    selectinload(Oportunidad.contacto),
    selectinload(Oportunidad.vendedor),
)


@router.get("", response_model=list[OportunidadRead])
def list_oportunidades(
    estado: EstadoOportunidad | None = None,
    cliente_id: int | None = None,
    desde: date | None = None,
    hasta: date | None = None,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
) -> list[Oportunidad]:
    """Lista oportunidades con filtros opcionales. `desde`/`hasta` filtran por
    fecha de último movimiento (inclusive)."""
    query = select(Oportunidad).options(*_RELATIONS)
    if estado is not None:
        query = query.where(Oportunidad.estado == estado)
    if cliente_id is not None:
        query = query.where(Oportunidad.cliente_id == cliente_id)
    if desde is not None:
        query = query.where(Oportunidad.fecha_ultimo_movimiento >= desde)
    if hasta is not None:
        # inclusive: hasta el final de ese día.
        query = query.where(Oportunidad.fecha_ultimo_movimiento < hasta + timedelta(days=1))
    return list(db.scalars(query.order_by(Oportunidad.fecha_ultimo_movimiento.desc())))


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
    oportunidad = db.get(Oportunidad, oportunidad_id, options=list(_RELATIONS))
    if oportunidad is None:
        raise NotFoundError("Oportunidad no encontrada")
    return oportunidad


@router.get("/{oportunidad_id}/sugerencia-compras", response_model=SugerenciaCompras)
def sugerencia_compras(
    oportunidad_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
) -> SugerenciaCompras:
    """Requerimiento pre-armado para la solicitud a Compras, desde el mail del
    cliente ya parseado por la IA. Alimenta el botón 'Pedir a Compras'."""
    if db.get(Oportunidad, oportunidad_id) is None:
        raise NotFoundError("Oportunidad no encontrada")
    return SugerenciaCompras(requerimiento=sugerir_requerimiento(db, oportunidad_id))


@router.post("/{oportunidad_id}/comentarios", response_model=OportunidadRead)
def agregar_comentario(
    oportunidad_id: int,
    body: ComentarioCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> Oportunidad:
    """Suma un comentario a la bitácora de seguimiento y marca movimiento."""
    op = db.get(Oportunidad, oportunidad_id, options=list(_RELATIONS))
    if op is None:
        raise NotFoundError("Oportunidad no encontrada")
    if not body.texto.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="El comentario no puede estar vacío."
        )
    ahora = datetime.now(timezone.utc)
    # Reasignar (no append in-place) para que SQLAlchemy detecte el cambio del JSONB.
    op.comentarios = [
        *(op.comentarios or []),
        {"fecha": ahora.isoformat(), "texto": body.texto.strip(), "autor": current_user.nombre},
    ]
    op.fecha_ultimo_movimiento = ahora
    db.commit()
    db.refresh(op)
    return op


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


@router.delete("/{oportunidad_id}", status_code=204)
def delete_oportunidad(
    oportunidad_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
) -> Response:
    """Elimina la oportunidad y todo lo que cuelga de ella (mails y sus adjuntos,
    solicitudes y sus respuestas, presupuestos y sus ítems, recordatorios)."""
    oportunidad = db.get(Oportunidad, oportunidad_id)
    if oportunidad is None:
        raise NotFoundError("Oportunidad no encontrada")
    eliminar_oportunidades(db, [oportunidad_id])
    db.commit()
    return Response(status_code=204)
