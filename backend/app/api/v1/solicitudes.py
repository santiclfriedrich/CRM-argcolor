"""CRUD endpoints for solicitudes a Compras (reemplazo del Google Form)."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_ai, get_current_user, get_user_gmail
from app.core.exceptions import NotFoundError
from app.db.models.oportunidades import EstadoOportunidad, Oportunidad
from app.db.models.respuestas_compras import RespuestaCompras
from app.db.models.solicitudes_compras import EstadoSolicitud, SolicitudCompras
from app.db.models.usuarios import Usuario
from app.db.session import get_db
from app.integrations.ai.base import AIProvider
from app.schemas.solicitud import (
    ParseRespuestaRequest,
    RespuestaComprasRead,
    SolicitudCreate,
    SolicitudDetail,
    SolicitudRead,
    SolicitudUpdate,
)
from app.services.solicitudes import build_email_preview, enviar_a_compras

router = APIRouter(prefix="/solicitudes", tags=["solicitudes"])

# Relaciones que exponen los schemas (evita N+1).
_RELATIONS = (
    selectinload(SolicitudCompras.oportunidad).selectinload(Oportunidad.cliente),
    selectinload(SolicitudCompras.solicitante),
    selectinload(SolicitudCompras.respuestas),
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
    respuestas = [RespuestaComprasRead.model_validate(r) for r in solicitud.respuestas]
    return SolicitudDetail(**read.model_dump(), email_preview=preview, respuestas=respuestas)


@router.post("/{solicitud_id}/enviar", response_model=SolicitudRead)
def enviar_solicitud(
    solicitud_id: int,
    db: Session = Depends(get_db),
    gmail=Depends(get_user_gmail),  # noqa: ANN001 - GmailClient del usuario logueado
    _: Usuario = Depends(get_current_user),
) -> SolicitudCompras:
    """Envía la solicitud a Compras por Gmail (desde la casilla del vendedor)."""
    solicitud = _get_loaded(db, solicitud_id)
    try:
        enviar_a_compras(db, gmail, solicitud)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001 - frontera con Gmail
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"No se pudo enviar a Compras: {exc}",
        ) from exc
    return _get_loaded(db, solicitud_id)


@router.post(
    "/{solicitud_id}/respuesta", response_model=RespuestaComprasRead, status_code=201
)
def cargar_respuesta(
    solicitud_id: int,
    body: ParseRespuestaRequest,
    db: Session = Depends(get_db),
    ai: AIProvider = Depends(get_ai),
    _: Usuario = Depends(get_current_user),
) -> RespuestaCompras:
    """Parsea con IA la respuesta de Compras (tabla de precios) y la registra.

    Marca la solicitud como respondida. Los ítems quedan listos para armar el
    presupuesto (POST /presupuestos/desde-solicitud/{id})."""
    solicitud = _get_loaded(db, solicitud_id)
    try:
        draft = ai.draft_quote(body.contenido)
    except Exception as exc:  # noqa: BLE001 - frontera con IA
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Error al parsear con IA: {exc}",
        ) from exc

    respuesta = RespuestaCompras(
        solicitud_compras_id=solicitud.id,
        contenido_raw=body.contenido,
        datos_parseados_ia=draft.model_dump(),
        notas_compras=draft.notas,
    )
    db.add(respuesta)
    solicitud.estado = EstadoSolicitud.respondida
    if solicitud.fecha_respuesta is None:
        solicitud.fecha_respuesta = datetime.now(timezone.utc)
    db.commit()
    db.refresh(respuesta)
    return respuesta


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
