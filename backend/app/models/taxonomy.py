from datetime import datetime
from enum import Enum

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Enum as SqlEnum,
    ForeignKey,
    Index,
    String,
    Table,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class TagType(str, Enum):
    FANDOM = "fandom"
    CHARACTER = "character"
    RELATIONSHIP = "relationship"
    ADDITIONAL = "additional"


class Rating(str, Enum):
    GENERAL_AUDIENCES = "General Audiences"
    TEEN_AND_UP_AUDIENCES = "Teen And Up Audiences"
    MATURE = "Mature"
    EXPLICIT = "Explicit"
    NOT_RATED = "Not Rated"


class WorkCategory(str, Enum):
    F_F = "F/F"
    F_M = "F/M"
    M_M = "M/M"
    GEN = "Gen"
    MULTI = "Multi"
    OTHER = "Other"


class ArchiveWarningType(str, Enum):
    GRAPHIC_DEPICTIONS_OF_VIOLENCE = "Graphic Depictions Of Violence"
    MAJOR_CHARACTER_DEATH = "Major Character Death"
    RAPE_NON_CON = "Rape/Non-Con"
    UNDERAGE = "Underage"
    NO_ARCHIVE_WARNINGS_APPLY = "No Archive Warnings Apply"
    CREATOR_CHOSE_NOT_TO_USE_ARCHIVE_WARNINGS = (
        "Creator Chose Not To Use Archive Warnings"
    )


work_tags = Table(
    "work_tags",
    Base.metadata,
    Column("work_id", ForeignKey("works.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)

work_warnings = Table(
    "work_warnings",
    Base.metadata,
    Column("work_id", ForeignKey("works.id", ondelete="CASCADE"), primary_key=True),
    Column(
        "warning_id",
        ForeignKey("archive_warnings.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)


class Tag(Base):
    __tablename__ = "tags"
    __table_args__ = (
        UniqueConstraint("name", "tag_type", name="uq_tags_name_type"),
        Index("ix_tags_name_lower", func.lower(text("name"))),
        Index("ix_tags_tag_type", "tag_type"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(300), nullable=False)
    tag_type: Mapped[TagType] = mapped_column(
        SqlEnum(
            TagType,
            name="tag_type",
            native_enum=False,
            create_constraint=True,
            values_callable=lambda values: [value.value for value in values],
        ),
        nullable=False,
    )
    is_canonical: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    works: Mapped[list["Work"]] = relationship(
        secondary=work_tags, back_populates="tags"
    )
    aliases: Mapped[list["TagAlias"]] = relationship(
        back_populates="canonical_tag", cascade="all, delete-orphan"
    )


class TagAlias(Base):
    __tablename__ = "tag_aliases"
    __table_args__ = (
        Index("ix_tag_aliases_name_lower", func.lower(text("alias_name")), unique=True),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    alias_name: Mapped[str] = mapped_column(String(300), nullable=False)
    canonical_tag_id: Mapped[int] = mapped_column(
        ForeignKey("tags.id", ondelete="CASCADE"), nullable=False, index=True
    )
    canonical_tag: Mapped[Tag] = relationship(back_populates="aliases")


class ArchiveWarning(Base):
    __tablename__ = "archive_warnings"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[ArchiveWarningType] = mapped_column(
        SqlEnum(
            ArchiveWarningType,
            name="archive_warning_type",
            native_enum=False,
            create_constraint=True,
            values_callable=lambda values: [value.value for value in values],
        ),
        nullable=False,
        unique=True,
    )
    works: Mapped[list["Work"]] = relationship(
        secondary=work_warnings, back_populates="warnings"
    )
