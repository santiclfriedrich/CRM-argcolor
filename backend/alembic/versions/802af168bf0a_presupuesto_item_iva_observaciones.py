"""presupuesto item iva observaciones

Revision ID: 802af168bf0a
Revises: b7ec8a171dca
Create Date: 2026-07-17 11:24:27.072333

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '802af168bf0a'
down_revision: str | None = 'b7ec8a171dca'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("presupuesto_items", sa.Column("iva", sa.Numeric(5, 2), nullable=True))
    op.add_column("presupuesto_items", sa.Column("observaciones", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("presupuesto_items", "observaciones")
    op.drop_column("presupuesto_items", "iva")
