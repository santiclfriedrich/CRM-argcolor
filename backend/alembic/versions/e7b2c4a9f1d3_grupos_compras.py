"""grupos de compras por usuario + destino en solicitud

Revision ID: e7b2c4a9f1d3
Revises: c3f9a1d2b4e6
Create Date: 2026-07-21 12:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e7b2c4a9f1d3"
down_revision: str | None = "c3f9a1d2b4e6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "grupos_compras",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "usuario_id",
            sa.Integer(),
            sa.ForeignKey("usuarios.id"),
            nullable=False,
        ),
        sa.Column("nombre", sa.String(length=120), nullable=False),
        sa.Column("to", sa.String(length=255), nullable=False),
        sa.Column("cc", postgresql.JSONB(), nullable=True),
        sa.Column("es_default", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index(
        op.f("ix_grupos_compras_usuario_id"), "grupos_compras", ["usuario_id"]
    )

    op.add_column(
        "solicitudes_compras", sa.Column("destino_to", sa.String(length=255), nullable=True)
    )
    op.add_column(
        "solicitudes_compras", sa.Column("destino_cc", postgresql.JSONB(), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("solicitudes_compras", "destino_cc")
    op.drop_column("solicitudes_compras", "destino_to")
    op.drop_index(op.f("ix_grupos_compras_usuario_id"), table_name="grupos_compras")
    op.drop_table("grupos_compras")
