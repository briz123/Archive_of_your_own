"""normalize typed work metadata

Revision ID: f476e2a28cc2
Revises: 12c7f8c7b85b
Create Date: 2026-10-30 10:11:27.956914
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f476e2a28cc2"
down_revision: Union[str, Sequence[str], None] = "12c7f8c7b85b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


RATING_NAMES = (
    "GENERAL_AUDIENCES",
    "TEEN_AND_UP_AUDIENCES",
    "MATURE",
    "EXPLICIT",
    "NOT_RATED",
)
CATEGORY_NAMES = ("F_F", "F_M", "M_M", "GEN", "MULTI", "OTHER")
WARNING_NAMES = (
    "Graphic Depictions Of Violence",
    "Major Character Death",
    "Rape/Non-Con",
    "Underage",
    "No Archive Warnings Apply",
    "Creator Chose Not To Use Archive Warnings",
)


def upgrade() -> None:
    op.create_table(
        "archive_warnings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "name",
            sa.Enum(
                *WARNING_NAMES,
                name="archive_warning_type",
                native_enum=False,
                create_constraint=True,
            ),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )
    op.create_table(
        "tag_aliases",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("alias_name", sa.String(length=300), nullable=False),
        sa.Column("canonical_tag_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["canonical_tag_id"], ["tags.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_tag_aliases_canonical_tag_id"),
        "tag_aliases",
        ["canonical_tag_id"],
        unique=False,
    )
    op.create_index(
        "ix_tag_aliases_name_lower",
        "tag_aliases",
        [sa.literal_column("lower(alias_name)")],
        unique=True,
    )
    op.create_table(
        "work_warnings",
        sa.Column("work_id", sa.Integer(), nullable=False),
        sa.Column("warning_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["warning_id"], ["archive_warnings.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["work_id"], ["works.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("work_id", "warning_id"),
    )

    op.add_column(
        "tags",
        sa.Column(
            "tag_type",
            sa.Enum(
                "fandom",
                "character",
                "relationship",
                "additional",
                name="tag_type",
                native_enum=False,
                create_constraint=True,
            ),
            nullable=True,
        ),
    )
    op.add_column(
        "tags",
        sa.Column("is_canonical", sa.Boolean(), server_default=sa.true(), nullable=False),
    )
    op.add_column(
        "tags",
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.add_column(
        "works",
        sa.Column(
            "category",
            sa.Enum(
                *CATEGORY_NAMES,
                name="workcategory",
                native_enum=False,
                create_constraint=True,
            ),
            nullable=True,
        ),
    )
    op.alter_column("tags", "category", existing_type=sa.String(length=15), nullable=True)
    op.add_column(
        "works",
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )

    op.execute(
        """
        INSERT INTO archive_warnings (name)
        VALUES
          ('Graphic Depictions Of Violence'),
          ('Major Character Death'),
          ('Rape/Non-Con'),
          ('Underage'),
          ('No Archive Warnings Apply'),
          ('Creator Chose Not To Use Archive Warnings')
        """
    )
    op.execute(
        """
        INSERT INTO tags (name, category, tag_type)
        SELECT name, NULL, 'fandom'
        FROM fandoms
        ON CONFLICT (name, category) DO NOTHING
        """
    )
    op.execute(
        """
        INSERT INTO work_tags (work_id, tag_id)
        SELECT wf.work_id, t.id
        FROM work_fandoms wf
        JOIN fandoms f ON f.id = wf.fandom_id
        JOIN tags t ON t.name = f.name AND t.tag_type = 'fandom'
        ON CONFLICT DO NOTHING
        """
    )
    op.execute(
        """
        UPDATE tags
        SET tag_type = CASE category
          WHEN 'Relationship' THEN 'relationship'
          WHEN 'Character' THEN 'character'
          WHEN 'Additional' THEN 'additional'
        END
        WHERE category IN ('Relationship', 'Character', 'Additional')
        """
    )
    op.execute(
        """
        INSERT INTO work_warnings (work_id, warning_id)
        SELECT wt.work_id, aw.id
        FROM work_tags wt
        JOIN tags t ON t.id = wt.tag_id AND t.category = 'Archive Warning'
        JOIN archive_warnings aw ON lower(aw.name) = lower(t.name)
        ON CONFLICT DO NOTHING
        """
    )
    op.execute(
        """
        UPDATE works
        SET rating = CASE lower(rating)
          WHEN 'general audiences' THEN 'GENERAL_AUDIENCES'
          WHEN 'teen and up audiences' THEN 'TEEN_AND_UP_AUDIENCES'
          WHEN 'mature' THEN 'MATURE'
          WHEN 'explicit' THEN 'EXPLICIT'
          WHEN 'not rated' THEN 'NOT_RATED'
          WHEN 'general_audiences' THEN 'GENERAL_AUDIENCES'
          WHEN 'teen_and_up_audiences' THEN 'TEEN_AND_UP_AUDIENCES'
          WHEN 'not_rated' THEN 'NOT_RATED'
          ELSE NULL
        END
        WHERE rating IS NOT NULL
        """
    )
    op.execute(
        """
        UPDATE works w
        SET rating = CASE lower(t.name)
          WHEN 'general audiences' THEN 'GENERAL_AUDIENCES'
          WHEN 'teen and up audiences' THEN 'TEEN_AND_UP_AUDIENCES'
          WHEN 'mature' THEN 'MATURE'
          WHEN 'explicit' THEN 'EXPLICIT'
          WHEN 'not rated' THEN 'NOT_RATED'
          WHEN 'general_audiences' THEN 'GENERAL_AUDIENCES'
          WHEN 'teen_and_up_audiences' THEN 'TEEN_AND_UP_AUDIENCES'
          WHEN 'not_rated' THEN 'NOT_RATED'
        END
        FROM work_tags wt
        JOIN tags t ON t.id = wt.tag_id AND t.category = 'Rating'
        WHERE wt.work_id = w.id
        """
    )
    op.execute(
        """
        UPDATE works w
        SET category = CASE lower(t.name)
          WHEN 'f/f' THEN 'F_F'
          WHEN 'f/m' THEN 'F_M'
          WHEN 'm/m' THEN 'M_M'
          WHEN 'gen' THEN 'GEN'
          WHEN 'multi' THEN 'MULTI'
          WHEN 'other' THEN 'OTHER'
        END
        FROM work_tags wt
        JOIN tags t ON t.id = wt.tag_id AND t.category = 'Category'
        WHERE wt.work_id = w.id
        """
    )
    op.execute(
        """
        UPDATE tags
        SET tag_type = 'additional'
        WHERE category IN ('Rating', 'Category', 'Archive Warning')
          AND tag_type IS NULL
          AND NOT (
            (category = 'Rating' AND lower(name) IN (
              'general audiences', 'teen and up audiences', 'mature',
              'explicit', 'not rated', 'general_audiences',
              'teen_and_up_audiences', 'not_rated'
            ))
            OR (category = 'Category' AND lower(name) IN (
              'f/f', 'f/m', 'm/m', 'gen', 'multi', 'other'
            ))
            OR (category = 'Archive Warning' AND EXISTS (
              SELECT 1 FROM archive_warnings aw
              WHERE lower(aw.name) = lower(tags.name)
            ))
          )
        """
    )
    op.execute(
        """
        DELETE FROM work_tags
        USING tags
        WHERE work_tags.tag_id = tags.id
          AND (
            (tags.category = 'Rating' AND lower(tags.name) IN (
              'general audiences', 'teen and up audiences', 'mature',
              'explicit', 'not rated', 'general_audiences',
              'teen_and_up_audiences', 'not_rated'
            ))
            OR (tags.category = 'Category' AND lower(tags.name) IN (
              'f/f', 'f/m', 'm/m', 'gen', 'multi', 'other'
            ))
            OR (tags.category = 'Archive Warning' AND EXISTS (
              SELECT 1 FROM archive_warnings aw
              WHERE lower(aw.name) = lower(tags.name)
            ))
          )
        """
    )
    op.execute(
        """
        DELETE FROM tags
        WHERE (category = 'Rating' AND lower(name) IN (
            'general audiences', 'teen and up audiences', 'mature',
            'explicit', 'not rated', 'general_audiences',
            'teen_and_up_audiences', 'not_rated'
          ))
          OR (category = 'Category' AND lower(name) IN (
            'f/f', 'f/m', 'm/m', 'gen', 'multi', 'other'
          ))
          OR (category = 'Archive Warning' AND EXISTS (
            SELECT 1 FROM archive_warnings aw
            WHERE lower(aw.name) = lower(tags.name)
          ))
        """
    )
    op.drop_constraint(op.f("uq_tags_name_category"), "tags", type_="unique")
    op.create_index(
        "ix_tags_name_lower",
        "tags",
        [sa.literal_column("lower(name)")],
        unique=False,
    )
    op.create_index("ix_tags_tag_type", "tags", ["tag_type"], unique=False)
    op.create_unique_constraint("uq_tags_name_type", "tags", ["name", "tag_type"])
    op.drop_column("tags", "category")
    op.alter_column(
        "tags",
        "tag_type",
        existing_type=sa.Enum(
            "fandom",
            "character",
            "relationship",
            "additional",
            name="tag_type",
            native_enum=False,
        ),
        nullable=False,
    )
    op.alter_column(
        "tags", "is_canonical", server_default=None, existing_type=sa.Boolean()
    )
    op.alter_column(
        "tags",
        "created_at",
        server_default=None,
        existing_type=sa.DateTime(timezone=True),
    )
    op.alter_column(
        "works",
        "updated_at",
        server_default=None,
        existing_type=sa.DateTime(timezone=True),
    )
    op.alter_column(
        "works",
        "rating",
        existing_type=sa.VARCHAR(length=100),
        type_=sa.Enum(*RATING_NAMES, name="rating", native_enum=False),
        existing_nullable=True,
    )
    op.create_check_constraint(
        "rating",
        "works",
        "rating IN ('GENERAL_AUDIENCES', 'TEEN_AND_UP_AUDIENCES', 'MATURE', "
        "'EXPLICIT', 'NOT_RATED')",
    )
    op.drop_table("work_fandoms")
    op.drop_table("fandoms")


def downgrade() -> None:
    raise NotImplementedError("The normalized metadata migration is not reversible.")
