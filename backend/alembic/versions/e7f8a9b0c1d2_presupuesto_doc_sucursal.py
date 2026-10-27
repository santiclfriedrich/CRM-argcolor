"""presupuestos: documento + sucursal (para el job del bot)

Revision ID: e7f8a9b0c1d2
Revises: d6e7f8a9b0c1
Create Date: 2026-10-27 19:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e7f8a9b0c1d2"
down_revision: str | None = "d6e7f8a9b0c1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "presupuestos",
        sa.Column("documento", sa.String(length=40), nullable=False, server_default="Presupuesto USD"),
    )
    op.add_column(
        "presupuestos",
        sa.Column("sucursal", sa.String(length=10), nullable=False, server_default="1"),
    )


def downgrade() -> None:
    op.drop_column("presupuestos", "sucursal")
    op.drop_column("presupuestos", "documento")
