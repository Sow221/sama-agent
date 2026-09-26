"""Add persistent conversations and memory items.

Revision ID: b7c21f4a9d30
Revises: 091542dcf94b
Create Date: 2026-09-26
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b7c21f4a9d30"
down_revision: Union[str, None] = "091542dcf94b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "conversations",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("journey_id", sa.String(length=64), nullable=True),
        sa.Column("last_activity_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_conversations_user_id", "conversations", ["user_id"])

    op.create_table(
        "conversation_messages",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("conversation_id", sa.String(length=64), nullable=False),
        sa.Column("role", sa.String(length=12), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("language", sa.String(length=8), nullable=True),
        sa.Column("journey_id", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_conversation_messages_conversation_id",
        "conversation_messages",
        ["conversation_id"],
    )

    op.create_table(
        "memory_items",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("kind", sa.String(length=24), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("source", sa.String(length=24), nullable=True),
        sa.Column("journey_id", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_memory_items_user_id", "memory_items", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_memory_items_user_id", table_name="memory_items")
    op.drop_table("memory_items")
    op.drop_index(
        "ix_conversation_messages_conversation_id",
        table_name="conversation_messages",
    )
    op.drop_table("conversation_messages")
    op.drop_index("ix_conversations_user_id", table_name="conversations")
    op.drop_table("conversations")