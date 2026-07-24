"""Disparador de la sincronización GBP -> CRM desde el servidor.

Corre la sync en un hilo del proceso del backend (Railway), así sigue aunque el
usuario apague su máquina. Protegido por un token secreto (GBP_SYNC_TOKEN).
Es reanudable: volver a dispararlo saltea los que ya existen (dedup por CUIT).
"""

from __future__ import annotations

import logging
import threading
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status

from app.config import get_settings
from app.integrations.gbp.client import GBPClient
from app.services.gbp_sync import sincronizar_clientes

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sync", tags=["sync-gbp"])

_lock = threading.Lock()
_estado: dict = {
    "corriendo": False,
    "iniciado": None,
    "progreso": None,  # resumen parcial (se actualiza en cada lote)
    "ultimo_resultado": None,
}


def _correr() -> None:
    from app.db.session import SessionLocal

    db = SessionLocal()

    def _progreso(rep) -> None:  # noqa: ANN001
        _estado["progreso"] = rep.resumen()

    try:
        rep = sincronizar_clientes(db, GBPClient(), on_progress=_progreso)
        _estado["ultimo_resultado"] = rep.resumen()
        logger.info("Sync GBP terminada: %s", rep.resumen())
    except Exception as exc:  # noqa: BLE001 - frontera del job
        _estado["ultimo_resultado"] = f"ERROR: {type(exc).__name__}: {exc}"
        logger.exception("Sync GBP falló")
    finally:
        db.close()
        _estado["corriendo"] = False


def _verificar_token(token: str) -> None:
    esperado = get_settings().GBP_SYNC_TOKEN
    if not esperado or token != esperado:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Token inválido")


@router.get("/gbp")
def disparar_sync(token: str = "", force: int = 0) -> dict:
    """Dispara la sync (una sola vez). GET para poder abrirlo desde el navegador.
    Corre en segundo plano en el servidor; la respuesta vuelve al instante.

    Si una corrida quedó trabada (corriendo=true pero sin avanzar), usar
    `&force=1` para reiniciarla."""
    _verificar_token(token)
    with _lock:
        if _estado["corriendo"] and not force:
            return {"status": "ya_corriendo", **_estado}
        _estado["corriendo"] = True
        _estado["iniciado"] = datetime.now(timezone.utc).isoformat()
        _estado["progreso"] = None
        _estado["ultimo_resultado"] = None
        threading.Thread(target=_correr, daemon=True).start()
    return {
        "status": "reiniciado" if force else "iniciado",
        "detalle": "La migración corre en el servidor. Podés cerrar la Mac.",
    }


@router.get("/gbp/estado")
def estado_sync(token: str = "") -> dict:
    """Estado de la última corrida (para ver si sigue corriendo o el resultado)."""
    _verificar_token(token)
    return dict(_estado)
