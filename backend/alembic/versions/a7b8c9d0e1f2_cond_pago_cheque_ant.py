"""condicion de pago: cheque anticipado a entrega (15/30/60 días)

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-07-30 16:00:00.000000

"""
from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a7b8c9d0e1f2"
down_revision: str | None = "f6a7b8c9d0e1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# SQLAlchemy guarda el NOMBRE del miembro del enum como label en Postgres
# (los existentes son dias_15, transferencia, etc.), no el `value`. Por eso acá
# agregamos los nombres, no el texto visible.
_NUEVOS = ["cheque_ant_15", "cheque_ant_30", "cheque_ant_60"]


def upgrade() -> None:
    # ADD VALUE fuera de transacción (requisito de Postgres para enums).
    with op.get_context().autocommit_block():
        for val in _NUEVOS:
            op.execute(f"ALTER TYPE condicion_pago ADD VALUE IF NOT EXISTS '{val}'")


def downgrade() -> None:
    # Postgres no permite quitar valores de un enum de forma simple; se deja.
    pass
