"""cliente creado_por

Revision ID: c3f9a1d2b4e6
Revises: f2741a12f583
Create Date: 2026-07-21 10:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'c3f9a1d2b4e6'
down_revision: str | None = 'f2741a12f583'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("clientes", sa.Column("creado_por_id", sa.Integer(), nullable=True))
    op.create_index(
        op.f("ix_clientes_creado_por_id"), "clientes", ["creado_por_id"]
    )
    op.create_foreign_key(
        "fk_clientes_creado_por_id_usuarios",
        "clientes",
        "usuarios",
        ["creado_por_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_clientes_creado_por_id_usuarios", "clientes", type_="foreignkey"
    )
    op.drop_index(op.f("ix_clientes_creado_por_id"), table_name="clientes")
    op.drop_column("clientes", "creado_por_id")
