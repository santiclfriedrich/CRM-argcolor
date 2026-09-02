"""oportunidad.expediente (sección Gubernamental)

Revision ID: 5a6b7c8d9e0f
Revises: 4f5a6b7c8d9e
Create Date: 2026-09-02 12:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "5a6b7c8d9e0f"
down_revision: str | None = "4f5a6b7c8d9e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("oportunidades", sa.Column("expediente", sa.String(length=120), nullable=True))


def downgrade() -> None:
    op.drop_column("oportunidades", "expediente")
