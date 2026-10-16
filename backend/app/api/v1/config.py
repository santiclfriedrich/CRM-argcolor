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
from app.schemas.speech import SpeechCreate, SpeechRead, SpeechUpdate
from app.services.automatizacion import get_automatizacion, set_automatizacion
from app.services.conversion_estados import (
    get_conversion_estados,
    set_conversion_estados,
)
from app.services.grupos_compras import (
    create_grupo,
    delete_grupo,
    get_grupo,
    list_grupos,
    update_grupo,
)
from app.services.perfil_empresa import get_perfil_empresa, set_perfil_empresa
from app.services.solicitudes import (
    get_destinatarios_compras,
    set_destinatarios_compras,
)
from app.services.speeches import (
    create_speech,
    delete_speech,
    get_speech,
    list_speeches,
    update_speech,
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


class PerfilEmpresa(BaseModel):
    """Datos fijos de la empresa para autocompletar formularios de licitación."""

    razon_social: str = ""
    cuit: str = ""
    forma_juridica: str = ""
    fecha_contrato_social: str = ""
    domicilio: str = ""
    localidad: str = ""
    cp: str = ""
    provincia: str = ""
    telefono: str = ""
    email: str = ""
    condicion_iva: str = ""
    condicion_iibb: str = ""
    nro_iibb: str = ""
    jurisdicciones_iibb: str = ""
    condicion_ganancias: str = ""
    actividad_principal: str = ""
    actividad_secundaria: str = ""
    banco: str = ""
    sucursal: str = ""
    cuenta: str = ""
    cbu: str = ""
    contacto_nombre: str = ""
    contacto_area: str = ""
    contacto_email: str = ""
    concepto_retencion: str = ""
    observaciones: str = ""


@router.get("/perfil-empresa", response_model=PerfilEmpresa)
def leer_perfil_empresa(
    db: Session = Depends(get_db), _: Usuario = Depends(get_current_user)
) -> dict:
    return get_perfil_empresa(db)


@router.put("/perfil-empresa", response_model=PerfilEmpresa)
def actualizar_perfil_empresa(
    body: PerfilEmpresa,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
) -> dict:
    return set_perfil_empresa(db, body.model_dump())


class ConversionEstados(BaseModel):
    """Probabilidad de cierre por estado (fracción 0..1) para el pronóstico."""

    nueva: float = 0.10
    requiere_aclaracion: float = 0.10
    en_compras: float = 0.25
    cotizado_compras: float = 0.40
    presupuestada: float = 0.55
    confirmada: float = 0.85


@router.get("/conversion-estados", response_model=ConversionEstados)
def leer_conversion_estados(
    db: Session = Depends(get_db), _: Usuario = Depends(get_current_user)
) -> dict:
    return get_conversion_estados(db)


@router.put("/conversion-estados", response_model=ConversionEstados)
def actualizar_conversion_estados(
    body: ConversionEstados,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
) -> dict:
    return set_conversion_estados(db, body.model_dump())


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


# --- Speeches (plantillas de requerimiento a Compras, por usuario) ---


@router.get("/speeches", response_model=list[SpeechRead])
def listar_speeches(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> list:
    return list_speeches(db, current_user.id)


@router.post("/speeches", response_model=SpeechRead, status_code=201)
def crear_speech(
    body: SpeechCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    return create_speech(
        db, current_user.id, titulo=body.titulo.strip(), texto=body.texto
    )


@router.put("/speeches/{speech_id}", response_model=SpeechRead)
def actualizar_speech(
    speech_id: int,
    body: SpeechUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    speech = get_speech(db, speech_id, current_user.id)
    if speech is None:
        raise NotFoundError("Speech no encontrado")
    return update_speech(
        db,
        speech,
        titulo=body.titulo.strip() if body.titulo is not None else None,
        texto=body.texto,
    )


@router.delete("/speeches/{speech_id}", status_code=204)
def eliminar_speech(
    speech_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> Response:
    speech = get_speech(db, speech_id, current_user.id)
    if speech is None:
        raise NotFoundError("Speech no encontrado")
    delete_speech(db, speech)
    return Response(status_code=204)
