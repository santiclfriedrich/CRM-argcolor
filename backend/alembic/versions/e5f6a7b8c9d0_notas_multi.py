"""notas: varias por usuario (quita el unique de usuario_id)

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-07-28 15:00:00.000000

La tabla se creó recién y está vacía, así que se recrea sin el unique en
usuario_id para permitir varias notas por usuario.
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e5f6a7b8c9d0"
down_revision: str | None = "d4e5f6a7b8c9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _create(unique_usuario: bool) -> None:
    op.create_table(
        "notas_personales",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "usuario_id",
            sa.Integer(),
            sa.ForeignKey("usuarios.id"),
            nullable=False,
            unique=unique_usuario,
        ),
        sa.Column("contenido", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_notas_personales_usuario_id", "notas_personales", ["usuario_id"])


def upgrade() -> None:
    op.drop_index("ix_notas_personales_usuario_id", table_name="notas_personales")
    op.drop_table("notas_personales")
    _create(unique_usuario=False)


def downgrade() -> None:
    op.drop_index("ix_notas_personales_usuario_id", table_name="notas_personales")
    op.drop_table("notas_personales")
    _create(unique_usuario=True)
