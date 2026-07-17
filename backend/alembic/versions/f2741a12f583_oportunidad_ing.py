"""oportunidad ing

Revision ID: f2741a12f583
Revises: 802af168bf0a
Create Date: 2026-07-17 12:35:43.218244

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f2741a12f583'
down_revision: str | None = '802af168bf0a'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("oportunidades", sa.Column("ing", sa.String(length=10), nullable=True))


def downgrade() -> None:
    op.drop_column("oportunidades", "ing")
