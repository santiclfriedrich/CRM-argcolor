"""mails_programados: html + adjuntos (programados con formato/adjuntos)

Revision ID: b1c2d3e4f5a6
Revises: a0f1b2c3d4e5
Create Date: 2026-09-16 10:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "b1c2d3e4f5a6"
down_revision: str | None = "a0f1b2c3d4e5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("mails_programados", sa.Column("html", sa.Text(), nullable=True))
    op.add_column(
        "mails_programados",
        sa.Column("adjuntos", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("mails_programados", "adjuntos")
    op.drop_column("mails_programados", "html")
