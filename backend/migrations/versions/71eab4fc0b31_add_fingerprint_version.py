"""add file fingerprint version

Revision ID: 71eab4fc0b31
Revises: c7e2a41d9b60
Create Date: 2026-10-31
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "71eab4fc0b31"
down_revision: Union[str, Sequence[str], None] = "c7e2a41d9b60"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "work_files",
        sa.Column(
            "fingerprint_version",
            sa.Integer(),
            server_default="1",
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("work_files", "fingerprint_version")
