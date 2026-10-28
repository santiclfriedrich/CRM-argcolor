"""Presupuestos: armador de cotizaciones y generación del PDF."""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_user, get_user_gmail, resolver_duenio
from app.api.listing import scalars_capped
from app.config import get_settings
from app.core.exceptions import NotFoundError
from app.db.models.oportunidades import AmbitoOportunidad, Oportunidad
from app.db.models.presupuestos import Presupuesto
from app.db.models.solicitudes_compras import SolicitudCompras
from app.db.models.usuarios import Usuario
from app.db.session import get_db
from app.integrations.gmail.errors import clasificar_error_gmail
from app.schemas.presupuesto import (
    EnviarPresupuestoRequest,
    ItemBase,
    PresupuestoCreate,
    PresupuestoListItem,
    PresupuestoRead,
    PresupuestoUpdate,
)
from app.services import presupuestos_gbp as gbp_svc
from app.services.importar_excel import parsear_y_validar
from app.services.presupuestos import (
    actualizar_presupuesto,
    crear_desde_solicitud,
    crear_lote,
    crear_presupuesto,
    enviar_al_cliente,
)
from app.services.storage import get_storage

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/presupuestos", tags=["presupuestos"])

_RELATIONS = (
    selectinload(Presupuesto.items),
    selectinload(Presupuesto.oportunidad).selectinload(Oportunidad.cliente),
    selectinload(Presupuesto.oportunidad).selectinload(Oportunidad.contacto),
    selectinload(Presupuesto.creado_por),
    selectinload(Presupuesto.editado_por),
)

# Listado: sin ítems (el mayor peso por fila) ni editado_por; el detalle usa su
# propio fetch con todo.
_LIST_RELATIONS = (
    selectinload(Presupuesto.oportunidad).selectinload(Oportunidad.cliente),
    selectinload(Presupuesto.creado_por),
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


@router.get("", response_model=list[PresupuestoListItem])
def list_presupuestos(
    oportunidad_id: int | None = None,
    usuario_id: int | None = None,
    ambito: AmbitoOportunidad | None = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> list[Presupuesto]:
    """Presupuestos personales: cada vendedor ve solo los de sus oportunidades.
    Los admin ven los de todo el equipo, o filtran por `usuario_id` (perfil).
    `ambito` limita a la sección (por el ámbito de la oportunidad del presupuesto)."""
    query = select(Presupuesto).options(*_LIST_RELATIONS).order_by(Presupuesto.id.desc())
    if oportunidad_id is not None:
        query = query.where(Presupuesto.oportunidad_id == oportunidad_id)
    duenio_id = resolver_duenio(current_user, usuario_id)
    if duenio_id is not None or ambito is not None:
        # OUTER join: los presupuestos STANDALONE (sin oportunidad, p.ej. los que
        # vienen de un Excel) no tienen ámbito ni vendedor, pero igual tienen que
        # verse. Por eso se incluyen aunque haya filtro de sección/dueño.
        sin_op = Presupuesto.oportunidad_id.is_(None)
        query = query.outerjoin(Oportunidad, Presupuesto.oportunidad_id == Oportunidad.id)
        if ambito is not None:
            query = query.where((Oportunidad.ambito == ambito.value) | sin_op)
        if duenio_id is not None:
            query = query.where(
                (Oportunidad.vendedor_id == duenio_id)
                | (sin_op & (Presupuesto.creado_por_id == duenio_id))
            )
    return scalars_capped(db, query, "presupuestos")


@router.post("", response_model=PresupuestoRead, status_code=201)
def create_presupuesto(
    body: PresupuestoCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> Presupuesto:
    """Crea un presupuesto (borrador). Con oportunidad la avanza a 'presupuestada';
    standalone (solo N° de cliente) si no se pasa oportunidad."""
    if body.oportunidad_id is not None and db.get(Oportunidad, body.oportunidad_id) is None:
        raise HTTPException(status_code=404, detail="La oportunidad no existe")
    presupuesto = crear_presupuesto(db, body)
    presupuesto.creado_por_id = current_user.id
    db.commit()
    return _get_loaded(db, presupuesto.id)


@router.post("/lote", response_model=list[PresupuestoRead], status_code=201)
def create_lote(
    body: PresupuestoCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> list[Presupuesto]:
    """Crea el presupuesto; si tiene más de GBP_MAX_ITEMS ítems lo parte en varias
    'partes' (cada una = un pedido de GBP). Devuelve la lista (1 o N)."""
    if body.oportunidad_id is not None and db.get(Oportunidad, body.oportunidad_id) is None:
        raise HTTPException(status_code=404, detail="La oportunidad no existe")
    creados = crear_lote(db, body, current_user.id)
    return [_get_loaded(db, p.id) for p in creados]


@router.post("/grupo/{grupo}/cargar-gbp", response_model=list[PresupuestoRead])
def cargar_grupo_en_gbp(
    grupo: str,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> list[Presupuesto]:
    """Encola TODAS las partes de un lote para que el bot las cargue en GBP."""
    partes = list(
        db.scalars(
            select(Presupuesto)
            .where(Presupuesto.gbp_grupo == grupo)
            .order_by(Presupuesto.gbp_parte)
            .options(*_RELATIONS)
        )
    )
    if not partes:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")
    try:
        for p in partes:
            try:
                gbp_svc.encolar(db, p)
            except (gbp_svc.YaCargadoError, gbp_svc.RequiereConfirmacionError):
                continue  # cargado o 'revisar': no se toca (se reencola por parte)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return [_get_loaded(db, p.id) for p in partes]


@router.post("/importar-lote", response_model=list[PresupuestoRead], status_code=201)
async def importar_lote(
    archivo: UploadFile = File(...),
    cliente_numero: str = Form(...),
    entrega_por: str = Form(...),
    documento: str = Form("Presupuesto USD"),
    sucursal: str = Form("1"),
    cliente_id: int | None = Form(None),
    oportunidad_id: int | None = Form(None),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> list[Presupuesto]:
    """Sube el Excel, valida TODO el archivo y, si no hay errores, crea el lote
    (partes de GBP_MAX_ITEMS). Si hay errores, devuelve 422 con la lista
    (fila + mensaje) y NO crea/encola nada."""
    contenido = await archivo.read()
    try:
        items, errores = parsear_y_validar(
            contenido, umbral_usd=get_settings().GBP_PRECIO_USD_MAX
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    if errores:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "mensaje": f"{len(errores)} fila(s) con errores. No se encoló nada.",
                "errores": errores,
            },
        )
    if oportunidad_id is not None and db.get(Oportunidad, oportunidad_id) is None:
        raise HTTPException(status_code=404, detail="La oportunidad no existe")
    data = PresupuestoCreate(
        oportunidad_id=oportunidad_id,
        cliente_id=cliente_id,
        cliente_numero=cliente_numero,
        entrega_por=entrega_por,
        documento=documento,
        sucursal=sucursal,
        items=[ItemBase.model_validate(it) for it in items],
    )
    creados = crear_lote(db, data, current_user.id)
    return [_get_loaded(db, p.id) for p in creados]


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
        logger.warning(
            "Falló enviar presupuesto (id=%s, usuario=%s): %s",
            presupuesto_id,
            current_user.id,
            exc,
        )
        code, msg = clasificar_error_gmail(exc)
        raise HTTPException(status_code=code, detail=msg) from exc
    return _get_loaded(db, presupuesto_id)


@router.post("/{presupuesto_id}/cargar-gbp", response_model=PresupuestoRead)
def cargar_en_gbp(
    presupuesto_id: int,
    confirmar: bool = False,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> Presupuesto:
    """Encola la parte para el bot ('Cargar en GBP' / reencolar por parte).
    Rechaza si ya está 'cargado' (409) y, si quedó en 'revisar' (pudo haber
    quedado guardado en GBP), exige `confirmar=true` para no duplicar."""
    presupuesto = _get_loaded(db, presupuesto_id)
    _assert_owner(presupuesto, current_user)
    try:
        gbp_svc.encolar(db, presupuesto, confirmar=confirmar)
    except gbp_svc.YaCargadoError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except gbp_svc.RequiereConfirmacionError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return _get_loaded(db, presupuesto_id)


@router.get("/{presupuesto_id}/pdf")
def descargar_pdf(
    presupuesto_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> Response:
    """Devuelve el PDF OFICIAL del presupuesto, que genera GBP. Si todavía no se
    cargó en GBP, no hay PDF (404): el documento sale del ERP, no del CRM."""
    presupuesto = _get_loaded(db, presupuesto_id)
    _assert_owner(presupuesto, current_user)
    if not presupuesto.pdf_gbp_key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Todavía no hay PDF: el presupuesto aún no se cargó en GBP.",
        )
    data = get_storage().get(presupuesto.pdf_gbp_key)
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{presupuesto.codigo}.pdf"'},
    )
