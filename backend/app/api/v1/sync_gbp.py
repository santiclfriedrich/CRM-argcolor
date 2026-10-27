"""Disparadores de la sincronización GBP -> CRM.

- Token (GET, para abrir desde el navegador / cron externo): /sync/gbp?token=…
- Autenticado (para el botón del CRM): POST /sync/gbp/run, GET /sync/gbp/status
- El scheduler la corre sola cada 8h (ver app/services/scheduler.py).

Corre en un hilo del backend (Railway), así sigue aunque se cierre la máquina.
Es incremental: dedup por CUIT, solo da de alta clientes nuevos.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import get_current_user
from app.config import get_settings
from app.db.models.usuarios import Usuario
from app.services.gbp_runner import estado_con_conteo, lanzar_sync

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sync", tags=["sync-gbp"])


def _verificar_token(token: str) -> None:
    esperado = get_settings().GBP_SYNC_TOKEN
    if not esperado or token != esperado:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Token inválido")


@router.get("/gbp")
def disparar_sync(token: str = "", force: int = 0, full: int = 0) -> dict:
    """Dispara la sync (por token, GET para abrirlo desde el navegador).
    `full=1` = scan completo; por defecto incremental (ids nuevos)."""
    _verificar_token(token)
    return lanzar_sync(force=bool(force), full=bool(full))


@router.get("/gbp/estado")
def estado_sync(token: str = "") -> dict:
    """Estado de la última corrida (por token)."""
    _verificar_token(token)
    return estado_con_conteo()


@router.post("/gbp/run")
def run_sync(
    force: int = 0,
    full: int = 0,
    _: Usuario = Depends(get_current_user),
) -> dict:
    """Dispara la sync desde el CRM (cualquier usuario logueado). Botón
    'Sincronizar GBP'. Por defecto incremental; `full=1` para un resync completo.
    La sync tiene lock, así que disparos simultáneos no la duplican."""
    return lanzar_sync(force=bool(force), full=bool(full))


@router.get("/gbp/status")
def status_sync(_: Usuario = Depends(get_current_user)) -> dict:
    """Estado de la última corrida (usuario logueado)."""
    return estado_con_conteo()


@router.post("/gbp/cliente/{cust_id}")
def traer_cliente(cust_id: int, _: Usuario = Depends(get_current_user)) -> dict:
    """Trae del ERP un cliente puntual por su N° exacto y lo da de alta en el CRM.

    Escotilla para el cliente VIEJO (id menor al watermark) que el sync incremental
    no ve. Es 1 sola llamada al ERP (~0.3s), así que corre sincrónico (no usa el
    hilo de la sync completa). Devuelve `status`: creado | ya_existe | no_encontrado
    | tipo_no_sincronizable | sin_cuit | error."""
    from app.db.session import SessionLocal
    from app.integrations.gbp.client import GBPClient
    from app.services.gbp_sync import sincronizar_cliente_por_id

    if cust_id <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="N° inválido")
    db = SessionLocal()
    erp = GBPClient()
    try:
        return sincronizar_cliente_por_id(db, erp, cust_id)
    except Exception as exc:  # noqa: BLE001 - frontera con GBP (red/SOAP)
        logger.warning("Traer cliente GBP %s falló: %s", cust_id, exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="GBP no respondió en este momento. Esperá unos segundos y reintentá.",
        ) from exc
    finally:
        erp.close()
        db.close()
