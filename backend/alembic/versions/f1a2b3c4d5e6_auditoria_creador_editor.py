"""auditoría: creador de oportunidad y creador/editor de presupuesto

Revision ID: f1a2b3c4d5e6
Revises: e7b2c4a9f1d3
Create Date: 2026-07-22 10:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f1a2b3c4d5e6"
down_revision: str | None = "e7b2c4a9f1d3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "oportunidades",
        sa.Column("creado_por_id", sa.Integer(), sa.ForeignKey("usuarios.id"), nullable=True),
    )
    op.add_column(
        "presupuestos",
        sa.Column("creado_por_id", sa.Integer(), sa.ForeignKey("usuarios.id"), nullable=True),
    )
    op.add_column(
        "presupuestos",
        sa.Column("editado_por_id", sa.Integer(), sa.ForeignKey("usuarios.id"), nullable=True),
    )
    op.add_column(
        "presupuestos",
        sa.Column("editado_en", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("presupuestos", "editado_en")
    op.drop_column("presupuestos", "editado_por_id")
    op.drop_column("presupuestos", "creado_por_id")
    op.drop_column("oportunidades", "creado_por_id")
