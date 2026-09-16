"""email tracking: mails.track_token / abierto_en / aperturas (Fase 5)

Revision ID: a0f1b2c3d4e5
Revises: 9e0f1a2b3c4d
Create Date: 2026-09-15 17:30:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a0f1b2c3d4e5"
down_revision: str | None = "9e0f1a2b3c4d"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("mails", sa.Column("track_token", sa.String(length=64), nullable=True))
    op.add_column("mails", sa.Column("abierto_en", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "mails",
        sa.Column("aperturas", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )
    op.create_index("ix_mails_track_token", "mails", ["track_token"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_mails_track_token", table_name="mails")
    op.drop_column("mails", "aperturas")
    op.drop_column("mails", "abierto_en")
    op.drop_column("mails", "track_token")
