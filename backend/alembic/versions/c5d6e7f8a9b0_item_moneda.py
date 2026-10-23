"""presupuesto_items: moneda por ítem (ARS/USD)

Revision ID: c5d6e7f8a9b0
Revises: a7f3c1b9e2d4
Create Date: 2026-10-23 16:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c5d6e7f8a9b0"
down_revision: str | None = "a7f3c1b9e2d4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "presupuesto_items",
        sa.Column("moneda", sa.String(length=3), nullable=False, server_default="USD"),
    )


def downgrade() -> None:
    op.drop_column("presupuesto_items", "moneda")
