"""oportunidad.dias (plazo en días, sección Gubernamental)

Revision ID: 3e4f5a6b7c8d
Revises: 2d3e4f5a6b7c
Create Date: 2026-08-31 10:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "3e4f5a6b7c8d"
down_revision: str | None = "2d3e4f5a6b7c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("oportunidades", sa.Column("dias", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("oportunidades", "dias")
