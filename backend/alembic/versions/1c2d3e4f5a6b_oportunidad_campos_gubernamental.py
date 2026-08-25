"""oportunidad: campos de la sección Gubernamental (licitaciones)

Revision ID: 1c2d3e4f5a6b
Revises: 0be7a1c2d3f4
Create Date: 2026-08-25 12:00:00.000000

Campos que solo se usan en oportunidades de ámbito gubernamental. Todos nullable.
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "1c2d3e4f5a6b"
down_revision: str | None = "0be7a1c2d3f4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("oportunidades", sa.Column("proceso", sa.String(length=120), nullable=True))
    op.add_column("oportunidades", sa.Column("portal", sa.String(length=120), nullable=True))
    op.add_column("oportunidades", sa.Column("apertura", sa.Date(), nullable=True))
    op.add_column("oportunidades", sa.Column("hr_pliego", sa.Time(), nullable=True))
    op.add_column("oportunidades", sa.Column("hr_apertura", sa.Time(), nullable=True))
    op.add_column("oportunidades", sa.Column("moneda", sa.String(length=10), nullable=True))
    op.add_column("oportunidades", sa.Column("pliego", sa.String(length=10), nullable=True))
    op.add_column("oportunidades", sa.Column("empresa", sa.String(length=20), nullable=True))
    op.add_column("oportunidades", sa.Column("presupuesto_url", sa.Text(), nullable=True))


def downgrade() -> None:
    for col in (
        "presupuesto_url",
        "empresa",
        "pliego",
        "moneda",
        "hr_apertura",
        "hr_pliego",
        "apertura",
        "portal",
        "proceso",
    ):
        op.drop_column("oportunidades", col)
