"""solicitud numero_cliente

Revision ID: 579202d4d017
Revises: 4652ad871c0b
Create Date: 2026-07-16 10:42:42.901449

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '579202d4d017'
down_revision: str | None = '4652ad871c0b'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "solicitudes_compras",
        sa.Column("numero_cliente", sa.String(length=80), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("solicitudes_compras", "numero_cliente")
