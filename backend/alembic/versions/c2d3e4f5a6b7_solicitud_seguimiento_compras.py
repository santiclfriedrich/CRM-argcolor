"""solicitudes_compras: seguimiento de Compras (eta, proveedor, notas)

Revision ID: c2d3e4f5a6b7
Revises: b1c2d3e4f5a6
Create Date: 2026-09-22 12:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c2d3e4f5a6b7"
down_revision: str | None = "b1c2d3e4f5a6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("solicitudes_compras", sa.Column("eta", sa.Date(), nullable=True))
    op.add_column(
        "solicitudes_compras", sa.Column("proveedor", sa.String(length=255), nullable=True)
    )
    op.add_column(
        "solicitudes_compras", sa.Column("seguimiento_notas", sa.Text(), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("solicitudes_compras", "seguimiento_notas")
    op.drop_column("solicitudes_compras", "proveedor")
    op.drop_column("solicitudes_compras", "eta")
