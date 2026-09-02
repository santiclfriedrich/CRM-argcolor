"""Speeches (plantillas de texto para el requerimiento a Compras), por usuario."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models.speeches import Speech


def list_speeches(db: Session, usuario_id: int) -> list[Speech]:
    return list(
        db.scalars(
            select(Speech)
            .where(Speech.usuario_id == usuario_id)
            .order_by(Speech.titulo)
        )
    )


def get_speech(db: Session, speech_id: int, usuario_id: int) -> Speech | None:
    """Devuelve el speech solo si pertenece al usuario (evita acceso ajeno)."""
    speech = db.get(Speech, speech_id)
    if speech is None or speech.usuario_id != usuario_id:
        return None
    return speech


def create_speech(db: Session, usuario_id: int, *, titulo: str, texto: str) -> Speech:
    speech = Speech(usuario_id=usuario_id, titulo=titulo, texto=texto)
    db.add(speech)
    db.commit()
    db.refresh(speech)
    return speech


def update_speech(
    db: Session, speech: Speech, *, titulo: str | None = None, texto: str | None = None
) -> Speech:
    if titulo is not None:
        speech.titulo = titulo
    if texto is not None:
        speech.texto = texto
    db.commit()
    db.refresh(speech)
    return speech


def delete_speech(db: Session, speech: Speech) -> None:
    db.delete(speech)
    db.commit()
