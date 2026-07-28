"""Bloc de notas personal del usuario logueado (varias notas, autoguardado)."""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.exceptions import NotFoundError
from app.db.models.notas_personales import NotaPersonal
from app.db.models.usuarios import Usuario
from app.db.session import get_db
from app.schemas.nota import NotaRead, NotaUpdate

router = APIRouter(prefix="/notas", tags=["notas"])


def _mia_o_404(db: Session, nota_id: int, user: Usuario) -> NotaPersonal:
    nota = db.get(NotaPersonal, nota_id)
    if nota is None or nota.usuario_id != user.id:
        raise NotFoundError("Nota no encontrada")
    return nota


@router.get("", response_model=list[NotaRead])
def list_notas(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> list[NotaPersonal]:
    """Notas del usuario, más recientes primero."""
    query = (
        select(NotaPersonal)
        .where(NotaPersonal.usuario_id == current_user.id)
        .order_by(NotaPersonal.updated_at.desc(), NotaPersonal.id.desc())
    )
    return list(db.scalars(query))


@router.post("", response_model=NotaRead, status_code=201)
def crear_nota(
    body: NotaUpdate | None = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> NotaPersonal:
    """Crea una nota (vacía por defecto) para el usuario."""
    nota = NotaPersonal(
        usuario_id=current_user.id, contenido=(body.contenido if body else "") or ""
    )
    db.add(nota)
    db.commit()
    db.refresh(nota)
    return nota


@router.put("/{nota_id}", response_model=NotaRead)
def guardar_nota(
    nota_id: int,
    body: NotaUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> NotaPersonal:
    """Guarda el contenido de una nota (lo llama el autoguardado)."""
    nota = _mia_o_404(db, nota_id, current_user)
    nota.contenido = body.contenido
    db.commit()
    db.refresh(nota)
    return nota


@router.delete("/{nota_id}", status_code=204)
def eliminar_nota(
    nota_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> None:
    nota = _mia_o_404(db, nota_id, current_user)
    db.delete(nota)
    db.commit()
