"""add local import metadata

Revision ID: c7e2a41d9b60
Revises: 8a4c1f7d2b90
Create Date: 2026-10-30
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c7e2a41d9b60"
down_revision: Union[str, Sequence[str], None] = "8a4c1f7d2b90"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("works", sa.Column("publisher", sa.String(length=500), nullable=True))
    op.add_column("works", sa.Column("identifier", sa.String(length=1000), nullable=True))
    op.add_column("works", sa.Column("subject", sa.Text(), nullable=True))
    op.add_column("works", sa.Column("creator", sa.String(length=500), nullable=True))
    op.add_column("works", sa.Column("producer", sa.String(length=500), nullable=True))
    op.add_column(
        "works", sa.Column("publication_date", sa.String(length=100), nullable=True)
    )
    op.add_column(
        "works", sa.Column("creation_date", sa.String(length=100), nullable=True)
    )
    op.add_column(
        "works", sa.Column("modification_date", sa.String(length=100), nullable=True)
    )
    op.alter_column(
        "work_files",
        "storage_filename",
        existing_type=sa.String(length=255),
        nullable=True,
    )
    op.add_column(
        "work_files",
        sa.Column(
            "storage_provider",
            sa.String(length=50),
            server_default="legacy_server",
            nullable=False,
        ),
    )
    op.add_column(
        "work_files",
        sa.Column(
            "status",
            sa.String(length=30),
            server_default="stored",
            nullable=False,
        ),
    )
    op.alter_column("work_files", "storage_provider", server_default="local")
    op.alter_column("work_files", "status", server_default="stored")


def downgrade() -> None:
    has_local_files = op.get_bind().execute(
        sa.text(
            "SELECT EXISTS (SELECT 1 FROM work_files WHERE storage_filename IS NULL)"
        )
    ).scalar()
    if has_local_files:
        raise RuntimeError(
            "Cannot downgrade while local-file records have no server filename."
        )

    op.drop_column("work_files", "status")
    op.drop_column("work_files", "storage_provider")
    op.alter_column(
        "work_files",
        "storage_filename",
        existing_type=sa.String(length=255),
        nullable=False,
    )
    op.drop_column("works", "modification_date")
    op.drop_column("works", "creation_date")
    op.drop_column("works", "publication_date")
    op.drop_column("works", "producer")
    op.drop_column("works", "creator")
    op.drop_column("works", "subject")
    op.drop_column("works", "identifier")
    op.drop_column("works", "publisher")
