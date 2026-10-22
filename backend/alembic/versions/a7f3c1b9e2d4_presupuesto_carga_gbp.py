"""presupuesto: carga a GBP en el Presupuesto (unifica; retira presupuesto_gbp)

Revision ID: a7f3c1b9e2d4
Revises: b1c2d3e4f5a7
Create Date: 2026-10-22 12:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a7f3c1b9e2d4"
down_revision: str | None = "b1c2d3e4f5a7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1) El Presupuesto absorbe el flujo de carga a GBP.
    op.alter_column("presupuestos", "oportunidad_id", existing_type=sa.Integer(), nullable=True)
    op.add_column(
        "presupuestos",
        sa.Column("cliente_id", sa.Integer(), sa.ForeignKey("clientes.id"), nullable=True),
    )
    op.add_column("presupuestos", sa.Column("cliente_numero", sa.String(length=40), nullable=True))
    op.add_column("presupuestos", sa.Column("entrega_por", sa.String(length=40), nullable=True))
    op.add_column("presupuestos", sa.Column("estado_carga", sa.String(length=20), nullable=True))
    op.add_column("presupuestos", sa.Column("pdf_gbp_key", sa.String(length=500), nullable=True))
    op.add_column("presupuestos", sa.Column("gbp_error", sa.Text(), nullable=True))
    op.add_column(
        "presupuestos",
        sa.Column("gbp_intentos", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "presupuestos", sa.Column("gbp_tomado_en", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "presupuestos", sa.Column("gbp_cargado_en", sa.DateTime(timezone=True), nullable=True)
    )
    op.create_index("ix_presupuestos_cliente_id", "presupuestos", ["cliente_id"])
    op.create_index("ix_presupuestos_cliente_numero", "presupuestos", ["cliente_numero"])
    op.create_index("ix_presupuestos_estado_carga", "presupuestos", ["estado_carga"])

    op.add_column(
        "presupuesto_items", sa.Column("part_number", sa.String(length=120), nullable=True)
    )

    # 2) Retiro la entidad separada presupuesto_gbp (estaba vacía).
    op.drop_index("ix_presupuesto_gbp_item_presupuesto_gbp_id", table_name="presupuesto_gbp_item")
    op.drop_table("presupuesto_gbp_item")
    op.drop_index("ix_presupuesto_gbp_numero_gbp", table_name="presupuesto_gbp")
    op.drop_index("ix_presupuesto_gbp_estado_carga", table_name="presupuesto_gbp")
    op.drop_index("ix_presupuesto_gbp_cliente_numero", table_name="presupuesto_gbp")
    op.drop_index("ix_presupuesto_gbp_oportunidad_id", table_name="presupuesto_gbp")
    op.drop_table("presupuesto_gbp")


def downgrade() -> None:
    # Recrea presupuesto_gbp (idéntica a b1c2d3e4f5a7) ...
    op.create_table(
        "presupuesto_gbp",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "oportunidad_id", sa.Integer(), sa.ForeignKey("oportunidades.id"), nullable=True
        ),
        sa.Column("cliente_numero", sa.String(length=40), nullable=True),
        sa.Column("entrega_por", sa.String(length=40), nullable=True),
        sa.Column("moneda", sa.String(length=3), nullable=False, server_default="USD"),
        sa.Column(
            "documento", sa.String(length=40), nullable=False, server_default="Presupuesto USD"
        ),
        sa.Column(
            "estado_carga", sa.String(length=20), nullable=False, server_default="borrador"
        ),
        sa.Column("numero_gbp", sa.String(length=80), nullable=True),
        sa.Column("pdf_key", sa.String(length=500), nullable=True),
        sa.Column("error_mensaje", sa.Text(), nullable=True),
        sa.Column("intentos", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("tomado_en", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cargado_en", sa.DateTime(timezone=True), nullable=True),
        sa.Column("creado_por_id", sa.Integer(), sa.ForeignKey("usuarios.id"), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )
    op.create_index("ix_presupuesto_gbp_oportunidad_id", "presupuesto_gbp", ["oportunidad_id"])
    op.create_index("ix_presupuesto_gbp_cliente_numero", "presupuesto_gbp", ["cliente_numero"])
    op.create_index("ix_presupuesto_gbp_estado_carga", "presupuesto_gbp", ["estado_carga"])
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

    # ... y revierte los cambios en presupuestos/presupuesto_items.
    op.drop_column("presupuesto_items", "part_number")
    op.drop_index("ix_presupuestos_estado_carga", table_name="presupuestos")
    op.drop_index("ix_presupuestos_cliente_numero", table_name="presupuestos")
    op.drop_index("ix_presupuestos_cliente_id", table_name="presupuestos")
    for col in (
        "gbp_cargado_en",
        "gbp_tomado_en",
        "gbp_intentos",
        "gbp_error",
        "pdf_gbp_key",
        "estado_carga",
        "entrega_por",
        "cliente_numero",
        "cliente_id",
    ):
        op.drop_column("presupuestos", col)
    op.alter_column("presupuestos", "oportunidad_id", existing_type=sa.Integer(), nullable=False)
