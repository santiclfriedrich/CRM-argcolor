"""condicion de pago: agregar 7 y 90 días (mapear con Días de Gubernamental)

Revision ID: 6b7c8d9e0f1a
Revises: 5a6b7c8d9e0f
Create Date: 2026-09-02 14:00:00.000000
"""
from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "6b7c8d9e0f1a"
down_revision: str | None = "5a6b7c8d9e0f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Postgres guarda el NOMBRE del miembro del enum como label (dias_15, …).
_NUEVOS = ["dias_7", "dias_90"]


def upgrade() -> None:
    # ADD VALUE fuera de transacción (requisito de Postgres para enums).
    with op.get_context().autocommit_block():
        for val in _NUEVOS:
            op.execute(f"ALTER TYPE condicion_pago ADD VALUE IF NOT EXISTS '{val}'")


def downgrade() -> None:
    # Postgres no permite quitar valores de un enum de forma simple; se deja.
    pass
