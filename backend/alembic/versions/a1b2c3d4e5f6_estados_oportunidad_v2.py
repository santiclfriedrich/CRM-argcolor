"""Reorganiza estados de oportunidad: agrega cotizado_compras y confirmada;
retira facturada y cerrada (remapeados a ganada / perdida).

Revision ID: a1b2c3d4e5f6
Revises: f1a2b3c4d5e6
Create Date: 2026-07-23
"""

from collections.abc import Sequence

from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: str | None = "f1a2b3c4d5e6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        # SQLite (tests) usa VARCHAR: el enum Python ya alcanza, nada que migrar.
        return

    # 1) Nuevos valores del enum. IF NOT EXISTS para que sea idempotente.
    #    (No se usan en esta misma transacción, así que es seguro en PG12+.)
    op.execute("ALTER TYPE estado_oportunidad ADD VALUE IF NOT EXISTS 'cotizado_compras'")
    op.execute("ALTER TYPE estado_oportunidad ADD VALUE IF NOT EXISTS 'confirmada'")

    # 2) Remapear filas de los estados que se retiran (a valores ya existentes).
    op.execute("UPDATE oportunidades SET estado = 'ganada' WHERE estado = 'facturada'")
    op.execute("UPDATE oportunidades SET estado = 'perdida' WHERE estado = 'cerrada'")
    # Los labels 'facturada'/'cerrada' quedan en el tipo pero sin filas: quitarlos
    # requeriría recrear el tipo (riesgoso) y no aporta nada, así que se dejan.


def downgrade() -> None:
    # No se puede quitar un valor de un enum de Postgres sin recrear el tipo, y
    # el remapeo de datos es irreversible. Downgrade no-op a propósito.
    pass
