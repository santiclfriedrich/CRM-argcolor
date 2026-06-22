"""CRUD endpoints for usuarios."""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.exceptions import NotFoundError
from app.db.models.usuarios import Usuario
from app.db.session import get_db
from app.schemas.usuario import UsuarioCreate, UsuarioRead, UsuarioUpdate

router = APIRouter(prefix="/usuarios", tags=["usuarios"])


@router.get("", response_model=list[UsuarioRead])
def list_usuarios(
    db: Session = Depends(get_db), _: Usuario = Depends(get_current_user)
) -> list[Usuario]:
    return list(db.scalars(select(Usuario).order_by(Usuario.nombre)))


@router.post("", response_model=UsuarioRead, status_code=201)
def create_usuario(
    body: UsuarioCreate, db: Session = Depends(get_db), _: Usuario = Depends(get_current_user)
) -> Usuario:
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
    _: Usuario = Depends(get_current_user),
) -> Usuario:
    usuario = db.get(Usuario, usuario_id)
    if usuario is None:
        raise NotFoundError("Usuario no encontrado")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(usuario, field, value)
    db.commit()
    db.refresh(usuario)
    return usuario
