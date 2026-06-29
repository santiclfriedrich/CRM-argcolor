"""Persistencia de adjuntos de imagen: archivo en disco + fila en `adjuntos`."""

import re
from pathlib import Path

from sqlalchemy.orm import Session

from app.config import settings
from app.db.models.adjuntos import Adjunto
from app.db.models.mails import Mail

_SAFE = re.compile(r"[^A-Za-z0-9._-]+")


def _safe_name(nombre: str) -> str:
    limpio = _SAFE.sub("_", nombre).strip("_")
    return limpio or "imagen"


def save_attachments(db: Session, mail: Mail, images: list[dict]) -> list[Adjunto]:
    """Guarda cada imagen en MEDIA_DIR/adjuntos/<mail_id>/ y crea su fila."""
    if not images:
        return []

    dest_dir = Path(settings.MEDIA_DIR) / "adjuntos" / str(mail.id)
    dest_dir.mkdir(parents=True, exist_ok=True)

    creados: list[Adjunto] = []
    for idx, img in enumerate(images):
        nombre = _safe_name(img.get("nombre") or "imagen")
        path = dest_dir / f"{idx}_{nombre}"
        path.write_bytes(img["data"])
        adjunto = Adjunto(
            mail_id=mail.id,
            nombre_archivo=img.get("nombre") or nombre,
            mime_type=img.get("mime"),
            path_storage=str(path),
        )
        db.add(adjunto)
        creados.append(adjunto)
    return creados
