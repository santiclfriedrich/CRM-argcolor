"""oportunidad estado cerrada y fecha_cierre

Revision ID: 5d3609025e57
Revises: 579202d4d017
Create Date: 2026-07-16 12:20:40.685364

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5d3609025e57'
down_revision: str | None = '579202d4d017'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Nuevo valor del enum. ADD VALUE no corre dentro de una transacción -> autocommit.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE estado_oportunidad ADD VALUE IF NOT EXISTS 'cerrada'")

    op.add_column(
        "oportunidades",
        sa.Column("fecha_cierre", sa.DateTime(timezone=True), nullable=True),
    )
    # Backfill: las ya cerradas quedan "fijadas" en su último movimiento.
    op.execute(
        """
        UPDATE oportunidades
        SET fecha_cierre = fecha_ultimo_movimiento
        WHERE estado IN ('ganada', 'cargada_en_gbp', 'facturada', 'perdida')
          AND fecha_cierre IS NULL
        """
    )


def downgrade() -> None:
    op.drop_column("oportunidades", "fecha_cierre")
    # El valor del enum 'cerrada' no se elimina (Postgres no soporta DROP VALUE).
