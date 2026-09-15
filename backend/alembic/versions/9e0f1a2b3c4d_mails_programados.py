"""tabla mails_programados (Fase 3: programar envío de correos)

Revision ID: 9e0f1a2b3c4d
Revises: 8d9e0f1a2b3c
Create Date: 2026-09-15 16:30:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "9e0f1a2b3c4d"
down_revision: str | None = "8d9e0f1a2b3c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "mails_programados",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "usuario_id",
            sa.Integer(),
            sa.ForeignKey("usuarios.id"),
            nullable=False,
        ),
        sa.Column("para", sa.String(length=500), nullable=False),
        sa.Column("asunto", sa.String(length=500), nullable=True),
        sa.Column("cuerpo", sa.Text(), nullable=False),
        sa.Column("programado_para", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "enviado", sa.Boolean(), nullable=False, server_default=sa.text("false")
        ),
        sa.Column("fecha_envio", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_mails_programados_usuario_id", "mails_programados", ["usuario_id"]
    )
    op.create_index(
        "ix_mails_programados_programado_para", "mails_programados", ["programado_para"]
    )
    op.create_index("ix_mails_programados_enviado", "mails_programados", ["enviado"])


def downgrade() -> None:
    op.drop_index("ix_mails_programados_enviado", table_name="mails_programados")
    op.drop_index("ix_mails_programados_programado_para", table_name="mails_programados")
    op.drop_index("ix_mails_programados_usuario_id", table_name="mails_programados")
    op.drop_table("mails_programados")
