"""campos seguimiento planilla

Revision ID: 7b2d5c20d4b2
Revises: 5d3609025e57
Create Date: 2026-07-16 13:07:55.662182

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7b2d5c20d4b2'
down_revision: str | None = '5d3609025e57'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("clientes", sa.Column("numero_cliente", sa.String(length=40), nullable=True))
    op.create_index("ix_clientes_numero_cliente", "clientes", ["numero_cliente"])
    op.add_column("oportunidades", sa.Column("producto", sa.String(length=120), nullable=True))
    op.add_column("oportunidades", sa.Column("numero_pedido", sa.String(length=60), nullable=True))
    op.add_column("oportunidades", sa.Column("observacion", sa.Text(), nullable=True))
    op.add_column(
        "oportunidades", sa.Column("fecha_respuesta_compras", sa.Date(), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("oportunidades", "fecha_respuesta_compras")
    op.drop_column("oportunidades", "observacion")
    op.drop_column("oportunidades", "numero_pedido")
    op.drop_column("oportunidades", "producto")
    op.drop_index("ix_clientes_numero_cliente", table_name="clientes")
    op.drop_column("clientes", "numero_cliente")
