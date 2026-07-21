"""Configuración editable desde la UI (flags de automatización, destinatarios)."""

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.exceptions import NotFoundError
from app.db.models.usuarios import Usuario
from app.db.session import get_db
from app.schemas.grupo_compras import (
    GrupoComprasCreate,
    GrupoComprasRead,
    GrupoComprasUpdate,
)
from app.services.automatizacion import get_automatizacion, set_automatizacion
from app.services.grupos_compras import (
    create_grupo,
    delete_grupo,
    get_grupo,
    list_grupos,
    update_grupo,
)
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


# --- Grupos de destinatarios de Compras (por usuario) ---


@router.get("/compras/grupos", response_model=list[GrupoComprasRead])
def listar_grupos_compras(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> list:
    return list_grupos(db, current_user.id)


@router.post("/compras/grupos", response_model=GrupoComprasRead, status_code=201)
def crear_grupo_compras(
    body: GrupoComprasCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    return create_grupo(
        db,
        current_user.id,
        nombre=body.nombre.strip(),
        to=str(body.to),
        cc=[str(e) for e in body.cc],
        es_default=body.es_default,
    )


@router.put("/compras/grupos/{grupo_id}", response_model=GrupoComprasRead)
def actualizar_grupo_compras(
    grupo_id: int,
    body: GrupoComprasUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    grupo = get_grupo(db, grupo_id, current_user.id)
    if grupo is None:
        raise NotFoundError("Grupo no encontrado")
    return update_grupo(
        db,
        grupo,
        nombre=body.nombre.strip() if body.nombre is not None else None,
        to=str(body.to) if body.to is not None else None,
        cc=[str(e) for e in body.cc] if body.cc is not None else None,
        es_default=body.es_default,
    )


@router.delete("/compras/grupos/{grupo_id}", status_code=204)
def eliminar_grupo_compras(
    grupo_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> Response:
    grupo = get_grupo(db, grupo_id, current_user.id)
    if grupo is None:
        raise NotFoundError("Grupo no encontrado")
    delete_grupo(db, grupo)
    return Response(status_code=204)
