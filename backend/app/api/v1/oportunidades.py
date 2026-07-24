"""CRUD endpoints for oportunidades."""

from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
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
from app.services.oportunidades import (
    buscar_adjunto,
    eliminar_adjunto_oportunidad,
    guardar_adjuntos_oportunidad,
)
from app.services.solicitudes import sugerir_requerimiento
from app.services.storage import get_storage

router = APIRouter(prefix="/oportunidades", tags=["oportunidades"])

# Carga anticipada de las relaciones que expone OportunidadRead (evita N+1).
_RELATIONS = (
    selectinload(Oportunidad.cliente),
    selectinload(Oportunidad.contacto),
    selectinload(Oportunidad.vendedor),
    selectinload(Oportunidad.creado_por),
)


@router.get("", response_model=list[OportunidadRead])
def list_oportunidades(
    estado: EstadoOportunidad | None = None,
    cliente_id: int | None = None,
    desde: date | None = None,
    hasta: date | None = None,
    solo_mias: bool = False,
    usuario_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> list[Oportunidad]:
    """Lista oportunidades con filtros opcionales. `desde`/`hasta` filtran por
    fecha de último movimiento (inclusive). Con `solo_mias=true` se limita a las
    del usuario logueado (toggle Mías/Todas). Con `usuario_id` se limita a las de
    ese vendedor (perfil de un usuario; el pipeline es compartido)."""
    query = select(Oportunidad).options(*_RELATIONS)
    if usuario_id is not None:
        query = query.where(Oportunidad.vendedor_id == usuario_id)
    elif solo_mias:
        query = query.where(Oportunidad.vendedor_id == current_user.id)
    if estado is not None:
        query = query.where(Oportunidad.estado == estado)
    if cliente_id is not None:
        query = query.where(Oportunidad.cliente_id == cliente_id)
    if desde is not None:
        query = query.where(Oportunidad.fecha_ultimo_movimiento >= desde)
    if hasta is not None:
        # inclusive: hasta el final de ese día.
        query = query.where(Oportunidad.fecha_ultimo_movimiento < hasta + timedelta(days=1))
    # Orden estable por llegada (id desc = más nueva arriba). No usamos
    # fecha_ultimo_movimiento porque editar una fila la actualizaría y la fila
    # "saltaría" hacia arriba en la lista.
    return list(db.scalars(query.order_by(Oportunidad.id.desc())))


@router.post("", response_model=OportunidadRead, status_code=201)
def create_oportunidad(
    body: OportunidadCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> Oportunidad:
    oportunidad = Oportunidad(**body.model_dump(), creado_por_id=current_user.id)
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


@router.delete("/{oportunidad_id}/comentarios/{indice}", response_model=OportunidadRead)
def eliminar_comentario(
    oportunidad_id: int,
    indice: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
) -> Oportunidad:
    """Borra un comentario de la bitácora por su posición en la lista."""
    op = db.get(Oportunidad, oportunidad_id, options=list(_RELATIONS))
    if op is None:
        raise NotFoundError("Oportunidad no encontrada")
    comentarios = list(op.comentarios or [])
    if indice < 0 or indice >= len(comentarios):
        raise NotFoundError("Comentario no encontrado")
    del comentarios[indice]
    op.comentarios = comentarios  # reasignar para que SQLAlchemy detecte el cambio
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
    data = body.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(oportunidad, field, value)
    # Editar inline (flag GBP o Ing.) no cuenta como movimiento: así la fila no
    # salta de posición en la lista (que se ordena por fecha_ultimo_movimiento).
    if set(data) - {"cargada_en_gbp", "ing"}:
        oportunidad.fecha_ultimo_movimiento = datetime.now(timezone.utc)
    db.commit()
    db.refresh(oportunidad)
    return oportunidad


@router.post("/{oportunidad_id}/adjuntos", response_model=OportunidadRead)
def subir_adjuntos_oportunidad(
    oportunidad_id: int,
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
) -> Oportunidad:
    """Adjunta archivos (presupuestos, planos, mails del cliente, etc.) a la oportunidad."""
    oportunidad = db.get(Oportunidad, oportunidad_id)
    if oportunidad is None:
        raise NotFoundError("Oportunidad no encontrada")
    archivos = [
        {"filename": f.filename, "mime_type": f.content_type, "data": f.file.read()}
        for f in files
    ]
    guardar_adjuntos_oportunidad(db, oportunidad, archivos)
    return oportunidad


@router.get("/{oportunidad_id}/adjuntos/{adjunto_id}")
def descargar_adjunto_oportunidad(
    oportunidad_id: int,
    adjunto_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
) -> Response:
    oportunidad = db.get(Oportunidad, oportunidad_id)
    if oportunidad is None:
        raise NotFoundError("Oportunidad no encontrada")
    meta = buscar_adjunto(oportunidad, adjunto_id)
    if meta is None or not meta.get("path"):
        raise NotFoundError("Adjunto no encontrado")
    try:
        data = get_storage().get(meta["path"])
    except FileNotFoundError as exc:
        raise NotFoundError("Adjunto no encontrado") from exc
    filename = meta.get("filename") or "adjunto"
    return Response(
        content=data,
        media_type=meta.get("mime_type") or "application/octet-stream",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.delete("/{oportunidad_id}/adjuntos/{adjunto_id}", response_model=OportunidadRead)
def eliminar_adjunto(
    oportunidad_id: int,
    adjunto_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
) -> Oportunidad:
    oportunidad = db.get(Oportunidad, oportunidad_id)
    if oportunidad is None:
        raise NotFoundError("Oportunidad no encontrada")
    if not eliminar_adjunto_oportunidad(db, oportunidad, adjunto_id):
        raise NotFoundError("Adjunto no encontrado")
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
