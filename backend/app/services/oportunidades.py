"""Adjuntos de oportunidades: archivo en disco + metadata en `archivos_adjuntos`."""

import re
from pathlib import Path

from sqlalchemy.orm import Session

from app.config import settings
from app.db.models.oportunidades import Oportunidad

_SAFE = re.compile(r"[^A-Za-z0-9._-]+")


def guardar_adjuntos_oportunidad(
    db: Session, op: Oportunidad, archivos: list[dict]
) -> list[dict]:
    """Guarda los archivos en MEDIA_DIR/oportunidades/<id>/ y los agrega a
    `archivos_adjuntos`. `archivos`: [{filename, mime_type, data}]. Cada adjunto
    recibe un id incremental estable (para descargarlo/borrarlo)."""
    dest = Path(settings.MEDIA_DIR) / "oportunidades" / str(op.id)
    dest.mkdir(parents=True, exist_ok=True)
    metas = list(op.archivos_adjuntos or [])
    prox = max((m.get("id", 0) for m in metas), default=0) + 1
    for i, f in enumerate(archivos):
        nombre = _SAFE.sub("_", f.get("filename") or "archivo").strip("_") or "archivo"
        ruta = dest / f"{prox + i}_{nombre}"
        ruta.write_bytes(f["data"])
        metas.append(
            {
                "id": prox + i,
                "filename": f.get("filename") or nombre,
                "mime_type": f.get("mime_type") or "application/octet-stream",
                "path": str(ruta),
            }
        )
    op.archivos_adjuntos = metas  # reasignar dispara el UPDATE del JSONB
    db.commit()
    db.refresh(op)
    return metas


def buscar_adjunto(op: Oportunidad, adjunto_id: int) -> dict | None:
    for m in op.archivos_adjuntos or []:
        if m.get("id") == adjunto_id:
            return m
    return None


def eliminar_adjunto_oportunidad(db: Session, op: Oportunidad, adjunto_id: int) -> bool:
    metas = list(op.archivos_adjuntos or [])
    resto = [m for m in metas if m.get("id") != adjunto_id]
    if len(resto) == len(metas):
        return False
    objetivo = next((m for m in metas if m.get("id") == adjunto_id), None)
    if objetivo:
        try:
            Path(objetivo.get("path", "")).unlink(missing_ok=True)
        except OSError:
            pass
    op.archivos_adjuntos = resto
    db.commit()
    db.refresh(op)
    return True
