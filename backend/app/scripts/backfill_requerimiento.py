"""Backfill del campo `requerimiento` en oportunidades ya existentes.

Rellena `Oportunidad.requerimiento` (nuevo) a partir de lo que la IA ya había
extraído del primer mail entrante de cada oportunidad. Solo toca las que lo
tienen vacío; es idempotente.

Uso:
    python -m app.scripts.backfill_requerimiento --dry-run   # simula
    python -m app.scripts.backfill_requerimiento             # escribe
"""

from __future__ import annotations

import argparse

from sqlalchemy import select

from app.db.models.oportunidades import Oportunidad
from app.db.session import SessionLocal
from app.services.solicitudes import sugerir_requerimiento


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="simula, no escribe")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        ids = list(
            db.scalars(
                select(Oportunidad.id).where(Oportunidad.requerimiento.is_(None))
            )
        )
        print(f"Oportunidades sin requerimiento: {len(ids)}")
        rellenadas = 0
        for i, op_id in enumerate(ids, 1):
            req = sugerir_requerimiento(db, op_id)
            if not req:
                continue
            if not args.dry_run:
                op = db.get(Oportunidad, op_id)
                if op is not None:
                    op.requerimiento = req
            rellenadas += 1
            if not args.dry_run and i % 100 == 0:
                db.commit()
                print(f"  … {i} procesadas, {rellenadas} rellenadas")
        if not args.dry_run:
            db.commit()
        verbo = "a rellenar" if args.dry_run else "rellenadas"
        print(f"Listo. {rellenadas} oportunidades {verbo}.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
