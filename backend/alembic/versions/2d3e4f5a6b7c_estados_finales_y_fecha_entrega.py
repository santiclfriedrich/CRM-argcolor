"""estados finales del funnel (verde) + fecha_entrega; estado enum -> varchar

Revision ID: 2d3e4f5a6b7c
Revises: 1c2d3e4f5a6b
Create Date: 2026-08-26 10:00:00.000000

Reestructura el cierre del funnel corporativo:
- `estado` deja de ser un enum nativo de Postgres y pasa a VARCHAR (para poder
  evolucionar estados sin ALTER TYPE / sin poder dropear valores).
- Se elimina el estado `ganada` ("Pago"): las oportunidades que estaban ahí
  pasan a `finalizado` (terminal, quedan en su mes).
- Nuevos estados (se guardan como strings, ya válidos en la app):
  pago_pendiente_entrega, entregado_pendiente_pago, finalizado.
- Nueva columna `fecha_entrega`.
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "2d3e4f5a6b7c"
down_revision: str | None = "1c2d3e4f5a6b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1) enum nativo -> varchar
    op.execute("ALTER TABLE oportunidades ALTER COLUMN estado TYPE varchar(30) USING estado::text")
    # 2) remapear las 'ganada' (Pago) al nuevo terminal 'finalizado'
    op.execute("UPDATE oportunidades SET estado = 'finalizado' WHERE estado = 'ganada'")
    # 3) el enum nativo ya no lo usa ninguna columna: se puede borrar
    op.execute("DROP TYPE IF EXISTS estado_oportunidad")
    # 4) fecha de entrega (estado Entregado / Pendiente de Pago)
    op.add_column("oportunidades", sa.Column("fecha_entrega", sa.Date(), nullable=True))


def downgrade() -> None:
    # Downgrade best-effort (no se usa en prod): se quita fecha_entrega y la
    # columna estado queda como varchar. No se recrea el enum nativo.
    op.drop_column("oportunidades", "fecha_entrega")
