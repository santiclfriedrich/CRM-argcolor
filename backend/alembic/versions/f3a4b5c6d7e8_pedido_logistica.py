"""seguimiento de pedidos: campos de logística en oportunidad

Revision ID: f3a4b5c6d7e8
Revises: d7e8f9a0b1c2
Create Date: 2026-10-08 10:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f3a4b5c6d7e8"
down_revision: str | None = "d7e8f9a0b1c2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("oportunidades", sa.Column("pedido_oc", sa.String(length=60), nullable=True))
    op.add_column(
        "oportunidades", sa.Column("pedido_remito", sa.String(length=60), nullable=True)
    )
    op.add_column("oportunidades", sa.Column("pedido_estado", sa.Text(), nullable=True))
    op.add_column(
        "oportunidades",
        sa.Column("pedido_estado_color", sa.String(length=10), nullable=True),
    )
    op.add_column(
        "oportunidades", sa.Column("pedido_fecha_inicio", sa.Date(), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("oportunidades", "pedido_fecha_inicio")
    op.drop_column("oportunidades", "pedido_estado_color")
    op.drop_column("oportunidades", "pedido_estado")
    op.drop_column("oportunidades", "pedido_remito")
    op.drop_column("oportunidades", "pedido_oc")
