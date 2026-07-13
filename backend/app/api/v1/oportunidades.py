"""CRUD endpoints for oportunidades."""

from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, Response
from sqlalchemy import delete, select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_user
from app.core.exceptions import NotFoundError
from app.db.models.adjuntos import Adjunto
from app.db.models.mails import Mail
from app.db.models.mails_descartados import MailDescartado
from app.db.models.oportunidades import EstadoOportunidad, Oportunidad
from app.db.models.presupuesto_items import PresupuestoItem
from app.db.models.presupuestos import Presupuesto
from app.db.models.recordatorios import Recordatorio
from app.db.models.respuestas_compras import RespuestaCompras
from app.db.models.solicitudes_compras import SolicitudCompras
from app.db.models.usuarios import Usuario
from app.db.session import get_db
from app.schemas.oportunidad import (
    OportunidadCreate,
    OportunidadRead,
    OportunidadUpdate,
)
from app.schemas.solicitud import SugerenciaCompras
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
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
) -> list[Oportunidad]:
    query = select(Oportunidad).options(*_RELATIONS)
    if estado is not None:
        query = query.where(Oportunidad.estado == estado)
    if cliente_id is not None:
        query = query.where(Oportunidad.cliente_id == cliente_id)
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

    mail_ids = list(db.scalars(select(Mail.id).where(Mail.oportunidad_id == oportunidad_id)))
    if mail_ids:
        # Borramos primero los archivos de los adjuntos del disco.
        for path in db.scalars(
            select(Adjunto.path_storage).where(Adjunto.mail_id.in_(mail_ids))
        ):
            if path:
                Path(path).unlink(missing_ok=True)
        db.execute(delete(Adjunto).where(Adjunto.mail_id.in_(mail_ids)))

    # Para los mails que vinieron de Gmail, dejamos su id marcado como eliminado
    # así el poller no los vuelve a ingestar mientras sigan en la ventana de búsqueda.
    gmail_ids = [
        g
        for g in db.scalars(
            select(Mail.gmail_message_id).where(Mail.oportunidad_id == oportunidad_id)
        )
        if g
    ]
    if gmail_ids:
        ya = set(
            db.scalars(
                select(MailDescartado.gmail_message_id).where(
                    MailDescartado.gmail_message_id.in_(gmail_ids)
                )
            )
        )
        for gid in gmail_ids:
            if gid not in ya:
                db.add(MailDescartado(gmail_message_id=gid, categoria="eliminado_manual"))

    sol_ids = list(
        db.scalars(
            select(SolicitudCompras.id).where(SolicitudCompras.oportunidad_id == oportunidad_id)
        )
    )
    if sol_ids:
        db.execute(
            delete(RespuestaCompras).where(RespuestaCompras.solicitud_compras_id.in_(sol_ids))
        )

    pres_ids = list(
        db.scalars(
            select(Presupuesto.id).where(Presupuesto.oportunidad_id == oportunidad_id)
        )
    )
    if pres_ids:
        db.execute(delete(PresupuestoItem).where(PresupuestoItem.presupuesto_id.in_(pres_ids)))

    db.execute(delete(Mail).where(Mail.oportunidad_id == oportunidad_id))
    db.execute(delete(SolicitudCompras).where(SolicitudCompras.oportunidad_id == oportunidad_id))
    db.execute(delete(Presupuesto).where(Presupuesto.oportunidad_id == oportunidad_id))
    db.execute(delete(Recordatorio).where(Recordatorio.oportunidad_id == oportunidad_id))
    db.delete(oportunidad)
    db.commit()
    return Response(status_code=204)
