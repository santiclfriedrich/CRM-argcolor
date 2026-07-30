"""CRUD endpoints for oportunidades."""

from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_user
from app.core.exceptions import NotFoundError
from app.db.models.mails import DireccionMail, Mail
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
from app.services.notificaciones import crear_notificacion
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
    selectinload(Oportunidad.transferencia_para),
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
    # Las propuestas (pendientes de revisión) no aparecen acá: se revisan aparte.
    query = select(Oportunidad).options(*_RELATIONS).where(
        Oportunidad.pendiente_revision.is_(False)
    )
    if usuario_id is not None:
        query = query.where(Oportunidad.vendedor_id == usuario_id)
    elif solo_mias:
        # Mías: las que son mías Y no están pendientes de transferir a otro
        # (mientras la transferencia está pendiente, sale de mis "Mías").
        query = query.where(
            Oportunidad.vendedor_id == current_user.id,
            Oportunidad.transferencia_para_id.is_(None),
        )
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


class TransferirRequest(BaseModel):
    a_usuario_id: int


def _get_op(db: Session, oportunidad_id: int) -> Oportunidad:
    op = db.get(Oportunidad, oportunidad_id, options=list(_RELATIONS))
    if op is None:
        raise NotFoundError("Oportunidad no encontrada")
    return op


@router.get("/transferencias-pendientes", response_model=list[OportunidadRead])
def transferencias_pendientes(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> list[Oportunidad]:
    """Oportunidades que otro me transfirió y todavía no acepté/rechacé."""
    query = (
        select(Oportunidad)
        .options(*_RELATIONS)
        .where(Oportunidad.transferencia_para_id == current_user.id)
        .order_by(Oportunidad.id.desc())
    )
    return list(db.scalars(query))


@router.post("/{oportunidad_id}/transferir", response_model=OportunidadRead)
def transferir_oportunidad(
    oportunidad_id: int,
    body: TransferirRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> Oportunidad:
    """Propone transferir la oportunidad a otro vendedor. Queda pendiente hasta
    que el destinatario acepte; mientras tanto sale de las 'Mías' de ambos."""
    op = _get_op(db, oportunidad_id)
    destino = db.get(Usuario, body.a_usuario_id)
    if destino is None or not destino.activo:
        raise HTTPException(status_code=404, detail="Usuario destino no encontrado o inactivo.")
    if destino.id == current_user.id:
        raise HTTPException(status_code=400, detail="No podés transferírtela a vos mismo.")
    if destino.id == op.vendedor_id:
        raise HTTPException(status_code=400, detail="La oportunidad ya es de ese vendedor.")
    op.transferencia_para_id = destino.id
    cliente = op.cliente.razon_social if op.cliente else f"#{op.id}"
    crear_notificacion(
        db,
        usuario_id=destino.id,
        mensaje=(
            f"{current_user.nombre} te quiere transferir la oportunidad de "
            f"{cliente}. Aceptala o rechazala."
        ),
        link=f"/oportunidades/{op.id}",
    )
    db.commit()
    db.refresh(op)
    return op


@router.post("/{oportunidad_id}/transferir/aceptar", response_model=OportunidadRead)
def aceptar_transferencia(
    oportunidad_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> Oportunidad:
    """El destinatario acepta: la oportunidad pasa a ser suya."""
    op = _get_op(db, oportunidad_id)
    if op.transferencia_para_id != current_user.id:
        raise HTTPException(status_code=403, detail="Esta transferencia no es para vos.")
    anterior = op.vendedor_id
    op.vendedor_id = current_user.id
    op.transferencia_para_id = None
    cliente = op.cliente.razon_social if op.cliente else f"#{op.id}"
    if anterior and anterior != current_user.id:
        crear_notificacion(
            db,
            usuario_id=anterior,
            mensaje=(
                f"{current_user.nombre} aceptó la oportunidad de {cliente} "
                "que le transferiste."
            ),
            link=f"/oportunidades/{op.id}",
        )
    db.commit()
    db.refresh(op)
    return op


@router.post("/{oportunidad_id}/transferir/rechazar", response_model=OportunidadRead)
def rechazar_transferencia(
    oportunidad_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> Oportunidad:
    """El destinatario rechaza: la transferencia se cancela y vuelve al vendedor."""
    op = _get_op(db, oportunidad_id)
    if op.transferencia_para_id != current_user.id:
        raise HTTPException(status_code=403, detail="Esta transferencia no es para vos.")
    op.transferencia_para_id = None
    cliente = op.cliente.razon_social if op.cliente else f"#{op.id}"
    if op.vendedor_id and op.vendedor_id != current_user.id:
        crear_notificacion(
            db,
            usuario_id=op.vendedor_id,
            mensaje=(
                f"{current_user.nombre} rechazó la oportunidad de {cliente} "
                "que le transferiste."
            ),
            link=f"/oportunidades/{op.id}",
        )
    db.commit()
    db.refresh(op)
    return op


class PropuestaAdjunto(BaseModel):
    id: int
    nombre: str
    mime: str | None = None


class PropuestaRead(BaseModel):
    """Propuesta de oportunidad (mail auto-ingestado) para revisar antes de crearla."""

    id: int
    cliente: str | None = None
    asunto: str | None = None
    requerimiento: str | None = None
    vendedor: str | None = None
    vendedor_id: int | None = None
    mail_de: str | None = None
    mail_para: str | None = None
    recibido_en: str | None = None  # casilla que recibió el mail
    mail_fecha: datetime | None = None
    mail_cuerpo: str | None = None
    adjuntos: list[PropuestaAdjunto] = []


@router.get("/propuestas", response_model=list[PropuestaRead])
def listar_propuestas(
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
) -> list[PropuestaRead]:
    """Oportunidades propuestas (pendientes de revisión), con el mail original.
    Compartidas: las ve todo el equipo para aceptar o descartar."""
    ops = db.scalars(
        select(Oportunidad)
        .options(*_RELATIONS)
        .where(Oportunidad.pendiente_revision.is_(True))
        .order_by(Oportunidad.id.desc())
    ).all()
    from app.db.models.adjuntos import Adjunto
    from app.services.ingest import _solo_email

    out: list[PropuestaRead] = []
    for op in ops:
        mail = db.scalar(
            select(Mail)
            .where(Mail.oportunidad_id == op.id, Mail.direccion == DireccionMail.entrante)
            .order_by(Mail.id.asc())
        )
        # Casilla que recibió el mail: la del vendedor (casilla polleada). Como
        # fallback, el "Para" si no coincide con el remitente.
        recibido_en = op.vendedor.email if op.vendedor else None
        if not recibido_en and mail and mail.para:
            dest = _solo_email(mail.para)
            if dest and dest != _solo_email(mail.de):
                recibido_en = dest
        adjuntos: list[PropuestaAdjunto] = []
        if mail is not None:
            filas = db.scalars(
                select(Adjunto).where(Adjunto.mail_id == mail.id).order_by(Adjunto.id.asc())
            )
            adjuntos = [
                PropuestaAdjunto(id=a.id, nombre=a.nombre_archivo, mime=a.mime_type)
                for a in filas
                if a.path_storage
            ]
        out.append(
            PropuestaRead(
                id=op.id,
                cliente=op.cliente.razon_social if op.cliente else None,
                asunto=op.asunto,
                requerimiento=op.requerimiento,
                vendedor=op.vendedor.nombre if op.vendedor else None,
                vendedor_id=op.vendedor_id,
                mail_de=mail.de if mail else None,
                mail_para=mail.para if mail else None,
                recibido_en=recibido_en,
                mail_fecha=mail.fecha if mail else None,
                mail_cuerpo=mail.cuerpo if mail else None,
                adjuntos=adjuntos,
            )
        )
    return out


@router.post("/{oportunidad_id}/propuesta/aceptar", response_model=OportunidadRead)
def aceptar_propuesta(
    oportunidad_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
) -> Oportunidad:
    """Acepta la propuesta: deja de estar pendiente y entra al pipeline."""
    op = _get_op(db, oportunidad_id)
    op.pendiente_revision = False
    op.fecha_ultimo_movimiento = datetime.now(timezone.utc)
    db.commit()
    db.refresh(op)
    return op


@router.post("/{oportunidad_id}/propuesta/rechazar", status_code=204)
def rechazar_propuesta(
    oportunidad_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
) -> None:
    """Descarta la propuesta: se elimina (y sus mails quedan marcados como
    descartados para que el polling no los vuelva a ingresar)."""
    op = _get_op(db, oportunidad_id)
    eliminar_oportunidades(db, [op.id])
    db.commit()


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


class AdjuntoRef(BaseModel):
    ref: str
    filename: str
    mime_type: str


@router.get("/{oportunidad_id}/adjuntos-compras", response_model=list[AdjuntoRef])
def adjuntos_para_compras(
    oportunidad_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
) -> list[dict]:
    """Archivos ya adjuntos a la oportunidad (subidos + los que llegaron por
    mail) que se pueden incluir en el pedido a Compras."""
    from app.services.solicitudes import adjuntos_de_oportunidad

    op = db.get(Oportunidad, oportunidad_id)
    if op is None:
        raise NotFoundError("Oportunidad no encontrada")
    return adjuntos_de_oportunidad(db, op)


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


class EliminarMultiples(BaseModel):
    ids: list[int]


@router.post("/eliminar-multiples")
def eliminar_multiples(
    body: EliminarMultiples,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
) -> dict[str, int]:
    """Borra varias oportunidades en una sola transacción (con todo lo que cuelga
    de cada una). Devuelve cuántas se pidieron eliminar."""
    ids = list({i for i in body.ids if i})
    if not ids:
        return {"eliminadas": 0}
    eliminar_oportunidades(db, ids)
    db.commit()
    return {"eliminadas": len(ids)}
