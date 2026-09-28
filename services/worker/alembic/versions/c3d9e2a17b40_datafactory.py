"""Usine à données wolof (doc 11) : exemples candidats et verdicts de l'étalon.

Revision ID: c3d9e2a17b40
Revises: b7c21f4a9d30
Create Date: 2026-09-28
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c3d9e2a17b40"
down_revision: Union[str, None] = "b7c21f4a9d30"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "df_items",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("text_wo", sa.Text(), nullable=False),
        sa.Column("text_fr", sa.Text(), nullable=True),
        sa.Column("audio_path", sa.String(length=512), nullable=True),
        sa.Column("source", sa.String(length=128), nullable=False),
        sa.Column("checks", sa.JSON(), nullable=False),
        sa.Column("auto_pass", sa.Boolean(), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_df_items_kind", "df_items", ["kind"])
    op.create_index("ix_df_items_auto_pass", "df_items", ["auto_pass"])
    op.create_index("ix_df_items_status", "df_items", ["status"])

    op.create_table(
        "df_verdicts",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("item_id", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("verdict", sa.String(length=8), nullable=False),
        sa.Column("correction", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["item_id"], ["df_items.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_df_verdicts_item_id", "df_verdicts", ["item_id"])
    op.create_index("ix_df_verdicts_user_id", "df_verdicts", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_df_verdicts_user_id", table_name="df_verdicts")
    op.drop_index("ix_df_verdicts_item_id", table_name="df_verdicts")
    op.drop_table("df_verdicts")
    op.drop_index("ix_df_items_status", table_name="df_items")
    op.drop_index("ix_df_items_auto_pass", table_name="df_items")
    op.drop_index("ix_df_items_kind", table_name="df_items")
    op.drop_table("df_items")
