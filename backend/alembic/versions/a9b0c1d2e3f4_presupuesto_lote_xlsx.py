"""presupuestos: fila_excel en ítems + .xlsx original del lote

Revision ID: a9b0c1d2e3f4
Revises: f8a9b0c1d2e3
Create Date: 2026-10-28 15:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a9b0c1d2e3f4"
down_revision: str | None = "f8a9b0c1d2e3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("presupuesto_items", sa.Column("fila_excel", sa.Integer(), nullable=True))
    op.add_column("presupuestos", sa.Column("lote_xlsx_key", sa.String(length=500), nullable=True))
    op.add_column("presupuestos", sa.Column("lote_nombre", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("presupuestos", "lote_nombre")
    op.drop_column("presupuestos", "lote_xlsx_key")
    op.drop_column("presupuesto_items", "fila_excel")
