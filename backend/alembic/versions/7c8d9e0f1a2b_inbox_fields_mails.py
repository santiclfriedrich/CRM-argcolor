"""inbox del CRM: campos usuario_id, leido, carpeta en mails

Revision ID: 7c8d9e0f1a2b
Revises: 6b7c8d9e0f1a
Create Date: 2026-09-15 12:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "7c8d9e0f1a2b"
down_revision: str | None = "6b7c8d9e0f1a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("mails", sa.Column("usuario_id", sa.Integer(), nullable=True))
    op.add_column(
        "mails",
        sa.Column(
            "leido",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column("mails", sa.Column("carpeta", sa.String(length=20), nullable=True))
    op.create_index("ix_mails_usuario_id", "mails", ["usuario_id"])
    op.create_index("ix_mails_carpeta", "mails", ["carpeta"])
    op.create_foreign_key(
        "fk_mails_usuario_id", "mails", "usuarios", ["usuario_id"], ["id"]
    )


def downgrade() -> None:
    op.drop_constraint("fk_mails_usuario_id", "mails", type_="foreignkey")
    op.drop_index("ix_mails_carpeta", table_name="mails")
    op.drop_index("ix_mails_usuario_id", table_name="mails")
    op.drop_column("mails", "carpeta")
    op.drop_column("mails", "leido")
    op.drop_column("mails", "usuario_id")
