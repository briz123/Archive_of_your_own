"""restore metadata timestamp defaults

Revision ID: 2d9a774d4a3e
Revises: f476e2a28cc2
Create Date: 2026-10-30
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "2d9a774d4a3e"
down_revision: Union[str, Sequence[str], None] = "f476e2a28cc2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "tags",
        "created_at",
        existing_type=sa.DateTime(timezone=True),
        server_default=sa.text("now()"),
    )
    op.alter_column(
        "works",
        "updated_at",
        existing_type=sa.DateTime(timezone=True),
        server_default=sa.text("now()"),
    )


def downgrade() -> None:
    op.alter_column(
        "works",
        "updated_at",
        existing_type=sa.DateTime(timezone=True),
        server_default=None,
    )
    op.alter_column(
        "tags",
        "created_at",
        existing_type=sa.DateTime(timezone=True),
        server_default=None,
    )
