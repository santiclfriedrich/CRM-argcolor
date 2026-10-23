"""presupuestos: lote (gbp_grupo / gbp_parte) para partir en tandas

Revision ID: d6e7f8a9b0c1
Revises: c5d6e7f8a9b0
Create Date: 2026-10-23 17:30:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d6e7f8a9b0c1"
down_revision: str | None = "c5d6e7f8a9b0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("presupuestos", sa.Column("gbp_grupo", sa.String(length=40), nullable=True))
    op.add_column("presupuestos", sa.Column("gbp_parte", sa.Integer(), nullable=True))
    op.create_index("ix_presupuestos_gbp_grupo", "presupuestos", ["gbp_grupo"])


def downgrade() -> None:
    op.drop_index("ix_presupuestos_gbp_grupo", table_name="presupuestos")
    op.drop_column("presupuestos", "gbp_parte")
    op.drop_column("presupuestos", "gbp_grupo")
