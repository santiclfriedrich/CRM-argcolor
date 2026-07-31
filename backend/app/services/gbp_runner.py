"""Runner en background del sync GBP -> CRM.

Compartido por el endpoint manual (token o autenticado) y el scheduler (cada 8h).
El sync es incremental: dedup por CUIT, solo da de alta clientes nuevos. Un lock
evita que se solapen dos corridas.
"""

from __future__ import annotations

import logging
import threading
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_estado: dict = {
    "corriendo": False,
    "iniciado": None,
    "progreso": None,  # resumen parcial (se actualiza en cada lote)
    "ultimo_resultado": None,
}


def _correr() -> None:
    from app.db.session import SessionLocal
    from app.integrations.gbp.client import GBPClient
    from app.services.gbp_sync import sincronizar_clientes

    db = SessionLocal()
    erp = GBPClient()

    def _progreso(rep) -> None:  # noqa: ANN001
        _estado["progreso"] = rep.resumen()

    try:
        rep = sincronizar_clientes(db, erp, on_progress=_progreso)
        _estado["ultimo_resultado"] = rep.resumen()
        logger.info("Sync GBP terminada: %s", rep.resumen())
    except Exception as exc:  # noqa: BLE001 - frontera del job
        _estado["ultimo_resultado"] = f"ERROR: {type(exc).__name__}: {exc}"
        logger.exception("Sync GBP falló")
    finally:
        erp.close()
        db.close()
        _estado["corriendo"] = False


def lanzar_sync(force: bool = False) -> dict:
    """Arranca el sync en un hilo aparte si no hay uno corriendo. Devuelve el
    estado/acción tomada."""
    with _lock:
        if _estado["corriendo"] and not force:
            return {"status": "ya_corriendo", **_estado}
        _estado["corriendo"] = True
        _estado["iniciado"] = datetime.now(timezone.utc).isoformat()
        _estado["progreso"] = None
        _estado["ultimo_resultado"] = None
        threading.Thread(target=_correr, daemon=True).start()
    return {"status": "reiniciado" if force else "iniciado"}


def estado_con_conteo() -> dict:
    """Estado de la última corrida + conteo real de clientes GBP en la base."""
    out = dict(_estado)
    try:
        from sqlalchemy import func, select

        from app.db.models.clientes import Cliente
        from app.db.session import SessionLocal

        db = SessionLocal()
        try:
            out["clientes_sincronizados_en_db"] = db.scalar(
                select(func.count())
                .select_from(Cliente)
                .where(Cliente.tipo.in_(["Gubernamental", "Corporativo", "Gremio"]))
            )
        finally:
            db.close()
    except Exception as exc:  # noqa: BLE001 - el conteo no debe romper el estado
        out["clientes_sincronizados_en_db"] = f"error: {exc}"
    return out
