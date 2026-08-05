"""ABM de usuarios. Listar/ver: cualquier usuario logueado (para selects de
vendedor). Alta/modificación/baja: solo admin."""

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin, get_current_user
from app.core.exceptions import NotFoundError
from app.db.models.clientes import Cliente
from app.db.models.oportunidades import Oportunidad
from app.db.models.usuarios import Usuario
from app.db.session import get_db
from app.schemas.usuario import MiSyncUpdate, UsuarioCreate, UsuarioRead, UsuarioUpdate

router = APIRouter(prefix="/usuarios", tags=["usuarios"])


@router.get("", response_model=list[UsuarioRead])
def list_usuarios(
    db: Session = Depends(get_db), _: Usuario = Depends(get_current_user)
) -> list[Usuario]:
    return list(db.scalars(select(Usuario).order_by(Usuario.nombre)))


# --- Auto-servicio: el propio usuario (se declaran antes de /{usuario_id} para
# que "me" no lo capture la ruta por id). ---
@router.get("/me", response_model=UsuarioRead)
def get_me(current_user: Usuario = Depends(get_current_user)) -> Usuario:
    return current_user


@router.patch("/me/sync-mail", response_model=UsuarioRead)
def update_mi_sync_mail(
    body: MiSyncUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> Usuario:
    """El usuario logueado pausa/activa su propia sincronización de mails."""
    current_user.sync_mail_activo = body.sync_mail_activo
    db.commit()
    db.refresh(current_user)
    return current_user


@router.post("", response_model=UsuarioRead, status_code=201)
def create_usuario(
    body: UsuarioCreate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
) -> Usuario:
    if db.scalar(select(Usuario).where(Usuario.email == body.email)):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe un usuario con ese email.",
        )
    usuario = Usuario(**body.model_dump())
    db.add(usuario)
    db.commit()
    db.refresh(usuario)
    return usuario


@router.get("/{usuario_id}", response_model=UsuarioRead)
def get_usuario(
    usuario_id: int, db: Session = Depends(get_db), _: Usuario = Depends(get_current_user)
) -> Usuario:
    usuario = db.get(Usuario, usuario_id)
    if usuario is None:
        raise NotFoundError("Usuario no encontrado")
    return usuario


@router.patch("/{usuario_id}", response_model=UsuarioRead)
def update_usuario(
    usuario_id: int,
    body: UsuarioUpdate,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(get_current_admin),
) -> Usuario:
    usuario = db.get(Usuario, usuario_id)
    if usuario is None:
        raise NotFoundError("Usuario no encontrado")
    cambios = body.model_dump(exclude_unset=True)
    # Evitar que un admin se bloquee a sí mismo (desactivarse o sacarse el rol).
    if usuario.id == admin.id:
        if cambios.get("activo") is False:
            raise HTTPException(status_code=400, detail="No podés desactivar tu propia cuenta.")
        if "rol" in cambios and cambios["rol"] != usuario.rol:
            raise HTTPException(status_code=400, detail="No podés cambiar tu propio rol.")
    for field, value in cambios.items():
        setattr(usuario, field, value)
    db.commit()
    db.refresh(usuario)
    return usuario


@router.delete("/{usuario_id}", status_code=204)
def delete_usuario(
    usuario_id: int,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(get_current_admin),
) -> Response:
    """Elimina un usuario solo si no tiene historial (oportunidades/clientes).
    Si tiene, conviene desactivarlo (activo=false) para no romper referencias."""
    usuario = db.get(Usuario, usuario_id)
    if usuario is None:
        raise NotFoundError("Usuario no encontrado")
    if usuario.id == admin.id:
        raise HTTPException(status_code=400, detail="No podés eliminar tu propia cuenta.")

    con_oportunidades = db.scalar(
        select(func.count()).select_from(Oportunidad).where(Oportunidad.vendedor_id == usuario_id)
    )
    con_clientes = db.scalar(
        select(func.count()).select_from(Cliente).where(Cliente.vendedor_asignado_id == usuario_id)
    )
    if con_oportunidades or con_clientes:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "El usuario tiene oportunidades o clientes asignados. "
                "Desactivalo en vez de eliminarlo."
            ),
        )
    db.delete(usuario)
    db.commit()
    return Response(status_code=204)
