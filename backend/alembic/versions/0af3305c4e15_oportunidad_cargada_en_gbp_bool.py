"""oportunidad cargada_en_gbp bool

Revision ID: 0af3305c4e15
Revises: 7b2d5c20d4b2
Create Date: 2026-07-17 08:46:01.354270

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0af3305c4e15'
down_revision: str | None = '7b2d5c20d4b2'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "oportunidades",
        sa.Column(
            "cargada_en_gbp",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    # No quedaban oportunidades en el estado 'cargada_en_gbp' (se verificó = 0),
    # así que no hace falta migrar filas. El valor del enum queda sin uso (Postgres
    # no soporta DROP VALUE; es inofensivo).


def downgrade() -> None:
    op.drop_column("oportunidades", "cargada_en_gbp")
