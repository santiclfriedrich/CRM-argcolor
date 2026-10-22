"""presupuesto gbp: cola de presupuestos a cargar en GBP por el bot

Revision ID: b1c2d3e4f5a7
Revises: f3a4b5c6d7e8
Create Date: 2026-10-22 10:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b1c2d3e4f5a7"
down_revision: str | None = "f3a4b5c6d7e8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "presupuesto_gbp",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "oportunidad_id",
            sa.Integer(),
            sa.ForeignKey("oportunidades.id"),
            nullable=True,
        ),
        sa.Column("cliente_numero", sa.String(length=40), nullable=True),
        sa.Column("entrega_por", sa.String(length=40), nullable=True),
        sa.Column("moneda", sa.String(length=3), nullable=False, server_default="USD"),
        sa.Column(
            "documento",
            sa.String(length=40),
            nullable=False,
            server_default="Presupuesto USD",
        ),
        sa.Column(
            "estado_carga",
            sa.String(length=20),
            nullable=False,
            server_default="borrador",
        ),
        sa.Column("numero_gbp", sa.String(length=80), nullable=True),
        sa.Column("pdf_key", sa.String(length=500), nullable=True),
        sa.Column("error_mensaje", sa.Text(), nullable=True),
        sa.Column("intentos", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("tomado_en", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cargado_en", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "creado_por_id", sa.Integer(), sa.ForeignKey("usuarios.id"), nullable=True
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "ix_presupuesto_gbp_oportunidad_id", "presupuesto_gbp", ["oportunidad_id"]
    )
    op.create_index(
        "ix_presupuesto_gbp_cliente_numero", "presupuesto_gbp", ["cliente_numero"]
    )
    op.create_index(
        "ix_presupuesto_gbp_estado_carga", "presupuesto_gbp", ["estado_carga"]
    )
    op.create_index("ix_presupuesto_gbp_numero_gbp", "presupuesto_gbp", ["numero_gbp"])

    op.create_table(
        "presupuesto_gbp_item",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "presupuesto_gbp_id",
            sa.Integer(),
            sa.ForeignKey("presupuesto_gbp.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("orden", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("tipo", sa.String(length=10), nullable=False),
        sa.Column("sku", sa.String(length=120), nullable=True),
        sa.Column("descripcion", sa.Text(), nullable=False),
        sa.Column("cantidad", sa.Numeric(14, 2), nullable=False, server_default="1"),
        sa.Column("precio_usd", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("iva", sa.Numeric(5, 2), nullable=True),
        sa.Column("fabricante", sa.String(length=120), nullable=True),
        sa.Column("part_number", sa.String(length=120), nullable=True),
    )
    op.create_index(
        "ix_presupuesto_gbp_item_presupuesto_gbp_id",
        "presupuesto_gbp_item",
        ["presupuesto_gbp_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_presupuesto_gbp_item_presupuesto_gbp_id", table_name="presupuesto_gbp_item"
    )
    op.drop_table("presupuesto_gbp_item")
    op.drop_index("ix_presupuesto_gbp_numero_gbp", table_name="presupuesto_gbp")
    op.drop_index("ix_presupuesto_gbp_estado_carga", table_name="presupuesto_gbp")
    op.drop_index("ix_presupuesto_gbp_cliente_numero", table_name="presupuesto_gbp")
    op.drop_index("ix_presupuesto_gbp_oportunidad_id", table_name="presupuesto_gbp")
    op.drop_table("presupuesto_gbp")
