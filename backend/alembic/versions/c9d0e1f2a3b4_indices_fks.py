"""Índices en FKs/columnas que se filtran o joinean (mejora de búsqueda)

Postgres no indexa las foreign keys solas; estas columnas se usan en WHERE/JOIN
de las consultas calientes (listados por cliente/vendedor, joins mail->oportunidad,
adjuntos, solicitudes, presupuestos, contactos/dominios de un cliente).

Revision ID: c9d0e1f2a3b4
Revises: b8c9d0e1f2a3
Create Date: 2026-08-06 12:00:00.000000

"""
from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c9d0e1f2a3b4"
down_revision: str | None = "b8c9d0e1f2a3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# (nombre_indice, tabla, columna)
_INDICES: list[tuple[str, str, str]] = [
    ("ix_oportunidades_cliente_id", "oportunidades", "cliente_id"),
    ("ix_oportunidades_vendedor_id", "oportunidades", "vendedor_id"),
    ("ix_oportunidades_fecha_ultimo_movimiento", "oportunidades", "fecha_ultimo_movimiento"),
    ("ix_mails_oportunidad_id", "mails", "oportunidad_id"),
    ("ix_adjuntos_mail_id", "adjuntos", "mail_id"),
    ("ix_solicitudes_compras_oportunidad_id", "solicitudes_compras", "oportunidad_id"),
    ("ix_solicitudes_compras_solicitante_id", "solicitudes_compras", "solicitante_id"),
    ("ix_presupuestos_oportunidad_id", "presupuestos", "oportunidad_id"),
    ("ix_contactos_cliente_cliente_id", "contactos_cliente", "cliente_id"),
    ("ix_dominios_cliente_cliente_id", "dominios_cliente", "cliente_id"),
]


def upgrade() -> None:
    for nombre, tabla, columna in _INDICES:
        op.create_index(nombre, tabla, [columna], if_not_exists=True)


def downgrade() -> None:
    for nombre, tabla, _columna in _INDICES:
        op.drop_index(nombre, table_name=tabla, if_exists=True)
