"""Presupuestos: armador de cotizaciones y generación del PDF."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_user, get_user_gmail, resolver_duenio
from app.api.listing import scalars_capped
from app.core.exceptions import NotFoundError
from app.db.models.oportunidades import Oportunidad
from app.db.models.presupuestos import Presupuesto
from app.db.models.solicitudes_compras import SolicitudCompras
from app.db.models.usuarios import Usuario
from app.db.session import get_db
from app.schemas.presupuesto import (
    EnviarPresupuestoRequest,
    PresupuestoCreate,
    PresupuestoRead,
    PresupuestoUpdate,
)
from app.services.presupuestos import (
    actualizar_presupuesto,
    crear_desde_solicitud,
    crear_presupuesto,
    enviar_al_cliente,
    render_pdf,
)

router = APIRouter(prefix="/presupuestos", tags=["presupuestos"])

_RELATIONS = (
    selectinload(Presupuesto.items),
    selectinload(Presupuesto.oportunidad).selectinload(Oportunidad.cliente),
    selectinload(Presupuesto.oportunidad).selectinload(Oportunidad.contacto),
    selectinload(Presupuesto.creado_por),
    selectinload(Presupuesto.editado_por),
)


def _get_loaded(db: Session, presupuesto_id: int) -> Presupuesto:
    presupuesto = db.get(Presupuesto, presupuesto_id, options=list(_RELATIONS))
    if presupuesto is None:
        raise NotFoundError("Presupuesto no encontrado")
    return presupuesto


def _assert_owner(presupuesto: Presupuesto, user: Usuario) -> None:
    """Acceso compartido: cualquier usuario puede ver/editar cualquier
    presupuesto. Se mantiene (no-op) para no tocar los call sites."""
    return


@router.get("", response_model=list[PresupuestoRead])
def list_presupuestos(
    oportunidad_id: int | None = None,
    usuario_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> list[Presupuesto]:
    """Presupuestos personales: cada vendedor ve solo los de sus oportunidades.
    Los admin ven los de todo el equipo, o filtran por `usuario_id` (perfil)."""
    query = select(Presupuesto).options(*_RELATIONS).order_by(Presupuesto.id.desc())
    if oportunidad_id is not None:
        query = query.where(Presupuesto.oportunidad_id == oportunidad_id)
    duenio_id = resolver_duenio(current_user, usuario_id)
    if duenio_id is not None:
        query = query.join(Oportunidad, Presupuesto.oportunidad_id == Oportunidad.id).where(
            Oportunidad.vendedor_id == duenio_id
        )
    return scalars_capped(db, query, "presupuestos")


@router.post("", response_model=PresupuestoRead, status_code=201)
def create_presupuesto(
    body: PresupuestoCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> Presupuesto:
    """Crea un presupuesto (borrador) y avanza la oportunidad a 'presupuestada'."""
    if db.get(Oportunidad, body.oportunidad_id) is None:
        raise HTTPException(status_code=404, detail="La oportunidad no existe")
    presupuesto = crear_presupuesto(db, body)
    presupuesto.creado_por_id = current_user.id
    db.commit()
    return _get_loaded(db, presupuesto.id)


@router.post("/desde-solicitud/{solicitud_id}", response_model=PresupuestoRead, status_code=201)
def create_desde_solicitud(
    solicitud_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
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
    except ValidationError as exc:
        # La respuesta de Compras guardada no coincide con el schema actual
        # (datos viejos/incompletos): mensaje claro en vez de un 500 opaco.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "La respuesta de Compras guardada está incompleta o desactualizada. "
                "Abrí el detalle de la solicitud y volvé a parsear la respuesta."
            ),
        ) from exc
    presupuesto.creado_por_id = current_user.id
    db.commit()
    return _get_loaded(db, presupuesto.id)


@router.get("/{presupuesto_id}", response_model=PresupuestoRead)
def get_presupuesto(
    presupuesto_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> Presupuesto:
    presupuesto = _get_loaded(db, presupuesto_id)
    _assert_owner(presupuesto, current_user)
    return presupuesto


@router.patch("/{presupuesto_id}", response_model=PresupuestoRead)
def update_presupuesto(
    presupuesto_id: int,
    body: PresupuestoUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> Presupuesto:
    presupuesto = _get_loaded(db, presupuesto_id)
    _assert_owner(presupuesto, current_user)
    actualizar_presupuesto(db, presupuesto, body)
    presupuesto.editado_por_id = current_user.id
    presupuesto.editado_en = datetime.now(timezone.utc)
    db.commit()
    return _get_loaded(db, presupuesto_id)


@router.delete("/{presupuesto_id}", status_code=204)
def delete_presupuesto(
    presupuesto_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> Response:
    presupuesto = _get_loaded(db, presupuesto_id)
    _assert_owner(presupuesto, current_user)
    for item in list(presupuesto.items):
        db.delete(item)
    db.delete(presupuesto)
    db.commit()
    return Response(status_code=204)


@router.post("/{presupuesto_id}/enviar", response_model=PresupuestoRead)
def enviar_presupuesto(
    presupuesto_id: int,
    body: EnviarPresupuestoRequest,
    db: Session = Depends(get_db),
    gmail=Depends(get_user_gmail),  # noqa: ANN001 - GmailClient del usuario logueado
    current_user: Usuario = Depends(get_current_user),
) -> Presupuesto:
    """Envía el presupuesto (PDF) al cliente por Gmail. Si no se indica `to`,
    usa el email del contacto de la oportunidad."""
    presupuesto = _get_loaded(db, presupuesto_id)
    _assert_owner(presupuesto, current_user)
    contacto = presupuesto.oportunidad.contacto if presupuesto.oportunidad else None
    destino = (body.to and str(body.to)) or (contacto.email if contacto else None)
    if not destino:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No hay email del cliente. Indicá uno o cargá el email del contacto.",
        )
    try:
        enviar_al_cliente(
            db, gmail, presupuesto, to=destino, mensaje=body.mensaje, remitente=current_user.email
        )
    except RuntimeError as exc:  # weasyprint / PDF no disponible
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc
    except Exception as exc:  # noqa: BLE001 - frontera con Gmail
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"No se pudo enviar el presupuesto: {exc}",
        ) from exc
    return _get_loaded(db, presupuesto_id)


@router.get("/{presupuesto_id}/pdf")
def descargar_pdf(
    presupuesto_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> Response:
    """Genera el PDF con los datos actuales y lo devuelve para descargar/ver."""
    presupuesto = _get_loaded(db, presupuesto_id)
    _assert_owner(presupuesto, current_user)
    try:
        contenido = render_pdf(db, presupuesto)
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc
    return Response(
        content=contenido,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{presupuesto.codigo}.pdf"'},
    )
