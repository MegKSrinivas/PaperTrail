"""add paper groups

Revision ID: 3c82fe9847b1
Revises: 9974ab1faabe
Create Date: 2026-09-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = '3c82fe9847b1'
down_revision: Union[str, None] = '9974ab1faabe'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "paper_groups",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "paper_group",
        sa.Column("paper_id", UUID(as_uuid=True), nullable=True),
        sa.Column("group_id", UUID(as_uuid=True), nullable=True),
        sa.ForeignKeyConstraint(["group_id"], ["paper_groups.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["paper_id"], ["papers.id"], ondelete="CASCADE"),
    )


def downgrade() -> None:
    op.drop_table("paper_group")
    op.drop_table("paper_groups")
