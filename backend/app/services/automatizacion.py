"""Flags de automatización de respuestas, persistidos en `configuracion`.

Permiten al usuario decidir desde la UI (sin reiniciar) si el acuse de recibo
y la aclaración al cliente se envían solos o requieren acción manual.
"""

from sqlalchemy.orm import Session

from app.db.models.configuracion import Configuracion

_KEY = "automatizacion"
# Defaults: acuse automático (seguro), aclaración manual (mensaje delicado).
_DEFAULTS = {"acuse_automatico": True, "aclaracion_automatica": False}


def get_automatizacion(db: Session) -> dict[str, bool]:
    cfg = db.get(Configuracion, _KEY)
    valor = cfg.valor if cfg and cfg.valor else {}
    return {**_DEFAULTS, **valor}


def set_automatizacion(
    db: Session,
    *,
    acuse_automatico: bool | None = None,
    aclaracion_automatica: bool | None = None,
) -> dict[str, bool]:
    actual = get_automatizacion(db)
    if acuse_automatico is not None:
        actual["acuse_automatico"] = acuse_automatico
    if aclaracion_automatica is not None:
        actual["aclaracion_automatica"] = aclaracion_automatica

    cfg = db.get(Configuracion, _KEY)
    if cfg is None:
        db.add(Configuracion(clave=_KEY, valor=actual))
    else:
        cfg.valor = actual  # reasignar dispara el UPDATE del JSONB
    db.commit()
    return actual
