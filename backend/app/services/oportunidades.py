"""Adjuntos de oportunidades: archivo en disco + metadata en `archivos_adjuntos`."""

import re

from sqlalchemy.orm import Session

from app.db.models.oportunidades import Oportunidad
from app.services.storage import get_storage

_SAFE = re.compile(r"[^A-Za-z0-9._-]+")


def guardar_adjuntos_oportunidad(
    db: Session, op: Oportunidad, archivos: list[dict], *, origen: str | None = None
) -> list[dict]:
    """Guarda los archivos en el storage (key `oportunidades/<id>/…`) y los agrega
    a `archivos_adjuntos`. `archivos`: [{filename, mime_type, data}]. Cada adjunto
    recibe un id incremental estable (para descargarlo/borrarlo). `origen` marca de
    dónde vino el adjunto (ej. "requerimiento" para imágenes pegadas en el texto),
    para poder mostrarlo aparte de los adjuntos del cliente."""
    storage = get_storage()
    metas = list(op.archivos_adjuntos or [])
    prox = max((m.get("id", 0) for m in metas), default=0) + 1
    for i, f in enumerate(archivos):
        nombre = _SAFE.sub("_", f.get("filename") or "archivo").strip("_") or "archivo"
        key = f"oportunidades/{op.id}/{prox + i}_{nombre}"
        storage.put(key, f["data"], f.get("mime_type"))
        meta = {
            "id": prox + i,
            "filename": f.get("filename") or nombre,
            "mime_type": f.get("mime_type") or "application/octet-stream",
            "path": key,
        }
        if origen:
            meta["origen"] = origen
        metas.append(meta)
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
    if objetivo and objetivo.get("path"):
        try:
            get_storage().delete(objetivo["path"])
        except OSError:
            pass
    op.archivos_adjuntos = resto
    db.commit()
    db.refresh(op)
    return True
