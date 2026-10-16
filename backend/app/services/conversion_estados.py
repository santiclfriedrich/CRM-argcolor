"""Probabilidad de cierre por estado de oportunidad, para el pronóstico Monte
Carlo. Se guarda en `configuracion` (clave `conversion_estados`) y se edita desde
la web. Valores en fracción 0..1."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models.configuracion import Configuracion

_CLAVE = "conversion_estados"

# Defaults editables: una oportunidad avanzada cierra más que una nueva.
DEFAULT: dict[str, float] = {
    "nueva": 0.10,
    "requiere_aclaracion": 0.10,
    "en_compras": 0.25,
    "cotizado_compras": 0.40,
    "presupuestada": 0.55,
    "confirmada": 0.85,
}


def get_conversion_estados(db: Session) -> dict[str, float]:
    cfg = db.scalar(select(Configuracion).where(Configuracion.clave == _CLAVE))
    guardado = cfg.valor if cfg and cfg.valor else {}
    return {**DEFAULT, **guardado}


def set_conversion_estados(db: Session, data: dict[str, float]) -> dict[str, float]:
    # Solo claves conocidas, acotadas a 0..1.
    limpio = {k: min(max(float(data.get(k, DEFAULT[k])), 0.0), 1.0) for k in DEFAULT}
    cfg = db.scalar(select(Configuracion).where(Configuracion.clave == _CLAVE))
    if cfg is None:
        cfg = Configuracion(clave=_CLAVE, valor=limpio)
        db.add(cfg)
    else:
        cfg.valor = limpio
    db.commit()
    return limpio
