"""oportunidad pendiente de revisión (propuesta desde mail auto-ingestado)

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-07-30 10:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f6a7b8c9d0e1"
down_revision: str | None = "e5f6a7b8c9d0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "oportunidades",
        sa.Column(
            "pendiente_revision",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.create_index(
        "ix_oportunidades_pendiente_revision", "oportunidades", ["pendiente_revision"]
    )


def downgrade() -> None:
    op.drop_index("ix_oportunidades_pendiente_revision", table_name="oportunidades")
    op.drop_column("oportunidades", "pendiente_revision")
