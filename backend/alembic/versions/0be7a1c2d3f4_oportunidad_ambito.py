"""oportunidad.ambito (sección Corporativo / Gubernamental)

Revision ID: 0be7a1c2d3f4
Revises: d0e1f2a3b4c5
Create Date: 2026-08-25 11:00:00.000000

Agrega el discriminador de sección a las oportunidades y backfillea las
existentes según el `tipo` del cliente (Gubernamental → gubernamental; el resto
queda en el default 'corporativo').
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0be7a1c2d3f4"
down_revision: str | None = "d0e1f2a3b4c5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "oportunidades",
        sa.Column(
            "ambito",
            sa.String(length=20),
            nullable=False,
            server_default="corporativo",
        ),
    )
    op.create_index("ix_oportunidades_ambito", "oportunidades", ["ambito"])
    # Backfill: las oportunidades de clientes Gubernamentales pasan a gubernamental.
    op.execute(
        """
        UPDATE oportunidades o
        SET ambito = 'gubernamental'
        FROM clientes c
        WHERE o.cliente_id = c.id AND lower(c.tipo) = 'gubernamental'
        """
    )


def downgrade() -> None:
    op.drop_index("ix_oportunidades_ambito", table_name="oportunidades")
    op.drop_column("oportunidades", "ambito")
