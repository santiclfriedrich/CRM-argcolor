"""Bloc de notas personal del usuario logueado (autoguardado, sin botón)."""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.models.notas_personales import NotaPersonal
from app.db.models.usuarios import Usuario
from app.db.session import get_db
from app.schemas.nota import NotaRead, NotaUpdate

router = APIRouter(prefix="/notas", tags=["notas"])


@router.get("", response_model=NotaRead)
def get_nota(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> NotaRead:
    """Devuelve el bloc de notas del usuario (vacío si nunca escribió)."""
    nota = db.scalar(
        select(NotaPersonal).where(NotaPersonal.usuario_id == current_user.id)
    )
    if nota is None:
        return NotaRead(contenido="")
    return NotaRead.model_validate(nota)


@router.put("", response_model=NotaRead)
def guardar_nota(
    body: NotaUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> NotaRead:
    """Guarda (upsert) el bloc de notas del usuario. Lo llama el autoguardado."""
    nota = db.scalar(
        select(NotaPersonal).where(NotaPersonal.usuario_id == current_user.id)
    )
    if nota is None:
        nota = NotaPersonal(usuario_id=current_user.id, contenido=body.contenido)
        db.add(nota)
    else:
        nota.contenido = body.contenido
    db.commit()
    db.refresh(nota)
    return NotaRead.model_validate(nota)
