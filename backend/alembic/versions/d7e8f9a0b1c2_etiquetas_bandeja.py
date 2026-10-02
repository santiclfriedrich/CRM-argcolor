"""etiquetas de la bandeja (labels por usuario) + relación N a N con mails

Revision ID: d7e8f9a0b1c2
Revises: c2d3e4f5a6b7
Create Date: 2026-10-02 10:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d7e8f9a0b1c2"
down_revision: str | None = "c2d3e4f5a6b7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "etiquetas_mail",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "usuario_id",
            sa.Integer(),
            sa.ForeignKey("usuarios.id"),
            nullable=False,
        ),
        sa.Column("nombre", sa.String(length=60), nullable=False),
        sa.Column(
            "color", sa.String(length=20), nullable=False, server_default="#64748b"
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "usuario_id", "nombre", name="uq_etiqueta_usuario_nombre"
        ),
    )
    op.create_index(
        "ix_etiquetas_mail_usuario_id", "etiquetas_mail", ["usuario_id"]
    )

    op.create_table(
        "mail_etiquetas",
        sa.Column(
            "mail_id",
            sa.Integer(),
            sa.ForeignKey("mails.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "etiqueta_id",
            sa.Integer(),
            sa.ForeignKey("etiquetas_mail.id", ondelete="CASCADE"),
            primary_key=True,
        ),
    )


def downgrade() -> None:
    op.drop_table("mail_etiquetas")
    op.drop_index("ix_etiquetas_mail_usuario_id", table_name="etiquetas_mail")
    op.drop_table("etiquetas_mail")
