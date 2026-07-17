"""Persistencia de adjuntos de imagen: archivo en el storage + fila en `adjuntos`."""

import re

from sqlalchemy.orm import Session

from app.db.models.adjuntos import Adjunto
from app.db.models.mails import Mail
from app.services.storage import get_storage

_SAFE = re.compile(r"[^A-Za-z0-9._-]+")


def _safe_name(nombre: str) -> str:
    limpio = _SAFE.sub("_", nombre).strip("_")
    return limpio or "imagen"


def save_attachments(db: Session, mail: Mail, images: list[dict]) -> list[Adjunto]:
    """Guarda cada imagen en el storage (key `adjuntos/<mail_id>/…`) y crea su fila.
    En `path_storage` se guarda la key, no una ruta absoluta."""
    if not images:
        return []

    storage = get_storage()
    creados: list[Adjunto] = []
    for idx, img in enumerate(images):
        nombre = _safe_name(img.get("nombre") or "imagen")
        key = f"adjuntos/{mail.id}/{idx}_{nombre}"
        storage.put(key, img["data"], img.get("mime"))
        adjunto = Adjunto(
            mail_id=mail.id,
            nombre_archivo=img.get("nombre") or nombre,
            mime_type=img.get("mime"),
            path_storage=key,
        )
        db.add(adjunto)
        creados.append(adjunto)
    return creados
