"""add accounts and private ownership

Revision ID: 8a4c1f7d2b90
Revises: 2d9a774d4a3e
Create Date: 2026-10-30
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "8a4c1f7d2b90"
down_revision: Union[str, Sequence[str], None] = "2d9a774d4a3e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=True),
        sa.Column(
            "status",
            sa.String(length=20),
            server_default=sa.text("'active'"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("status IN ('active', 'inactive')", name="ck_users_status"),
        sa.CheckConstraint(
            "status != 'active' OR password_hash IS NOT NULL",
            name="ck_active_users_have_password_hash",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "uq_users_email_lower",
        "users",
        [sa.literal_column("lower(email)")],
        unique=True,
    )
    op.execute(
        """
        INSERT INTO users (email, password_hash, status)
        VALUES ('legacy@ayo.invalid', NULL, 'inactive')
        """
    )

    op.add_column(
        "works",
        sa.Column("user_id", sa.Integer(), nullable=True),
    )
    op.execute(
        """
        UPDATE works
        SET user_id = (SELECT id FROM users WHERE email = 'legacy@ayo.invalid')
        """
    )
    op.alter_column("works", "user_id", nullable=False)
    op.create_foreign_key(
        "fk_works_user_id_users",
        "works",
        "users",
        ["user_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_works_user_id", "works", ["user_id"], unique=False)

    op.add_column(
        "tags",
        sa.Column("user_id", sa.Integer(), nullable=True),
    )
    op.execute(
        """
        UPDATE tags
        SET user_id = (SELECT id FROM users WHERE email = 'legacy@ayo.invalid')
        """
    )
    op.alter_column("tags", "user_id", nullable=False)
    op.create_foreign_key(
        "fk_tags_user_id_users",
        "tags",
        "users",
        ["user_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_tags_user_id", "tags", ["user_id"], unique=False)
    op.drop_constraint("uq_tags_name_type", "tags", type_="unique")
    op.create_unique_constraint(
        "uq_tags_user_name_type",
        "tags",
        ["user_id", "name", "tag_type"],
    )

    op.drop_index("ix_tag_aliases_name_lower", table_name="tag_aliases")
    op.create_index(
        "ix_tag_aliases_name_lower",
        "tag_aliases",
        [sa.literal_column("lower(alias_name)"), "canonical_tag_id"],
        unique=True,
    )

    op.create_table(
        "user_sessions",
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("csrf_token_hash", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("token_hash"),
    )
    op.create_index(
        "ix_user_sessions_user_id", "user_sessions", ["user_id"], unique=False
    )
    op.create_index(
        "ix_user_sessions_expires_at", "user_sessions", ["expires_at"], unique=False
    )


def downgrade() -> None:
    raise NotImplementedError(
        "Account ownership cannot be safely downgraded to a shared public catalog."
    )
