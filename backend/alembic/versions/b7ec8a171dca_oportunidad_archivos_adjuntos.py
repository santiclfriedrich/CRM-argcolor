"""oportunidad archivos_adjuntos

Revision ID: b7ec8a171dca
Revises: 0af3305c4e15
Create Date: 2026-07-17 10:31:18.036167

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'b7ec8a171dca'
down_revision: str | None = '0af3305c4e15'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "oportunidades",
        sa.Column("archivos_adjuntos", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("oportunidades", "archivos_adjuntos")
