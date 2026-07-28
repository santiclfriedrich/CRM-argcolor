"""transferencia de oportunidad: destinatario pendiente

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-07-28 10:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b2c3d4e5f6a7"
down_revision: str | None = "a1b2c3d4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "oportunidades",
        sa.Column(
            "transferencia_para_id", sa.Integer(), sa.ForeignKey("usuarios.id"), nullable=True
        ),
    )


def downgrade() -> None:
    op.drop_column("oportunidades", "transferencia_para_id")
