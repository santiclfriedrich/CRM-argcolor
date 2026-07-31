"""CLI para sincronizar clientes del ERP GBP hacia el CRM.

Uso:
    python -m app.scripts.sync_gbp --dry-run            # simula, no escribe
    python -m app.scripts.sync_gbp --dry-run --limit 50 # simula, primeros 50
    python -m app.scripts.sync_gbp                       # corre en serio

Requiere las variables de entorno GBP_* (ver app/config.py). Nunca hardcodear
credenciales.
"""

from __future__ import annotations

import argparse
import logging

from app.db.session import SessionLocal
from app.integrations.gbp.client import GBPClient
from app.services.gbp_sync import CK_ID_A_CLASE, sincronizar_clientes


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync de clientes GBP -> CRM")
    parser.add_argument(
        "--dry-run", action="store_true", help="Simula sin escribir en el CRM"
    )
    parser.add_argument(
        "--limit", type=int, default=None, help="Procesar como máximo N clientes del tipo buscado"
    )
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    clases = ", ".join(f"{k}={v}" for k, v in CK_ID_A_CLASE.items())
    print(f"Sync GBP -> CRM | tipos (ck_id): {clases}")
    print(f"Modo: {'DRY-RUN (no escribe)' if args.dry_run else 'REAL'}")

    erp = GBPClient()
    db = SessionLocal()
    try:
        rep = sincronizar_clientes(db, erp, dry_run=args.dry_run, limit=args.limit)
    finally:
        erp.close()
        db.close()

    print("\n== Resultado ==")
    print(rep.resumen())
    if rep.detalle_errores:
        print("\nErrores:")
        for e in rep.detalle_errores[:20]:
            print(f"  - {e}")


if __name__ == "__main__":
    main()
