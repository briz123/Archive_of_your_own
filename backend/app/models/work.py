from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Enum as SqlEnum, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.taxonomy import ArchiveWarning, Rating, WorkCategory, work_tags, work_warnings


class Work(Base):
    __tablename__ = "works"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    original_author: Mapped[Optional[str]] = mapped_column(String(500))
    description: Mapped[Optional[str]] = mapped_column(Text)
    language: Mapped[Optional[str]] = mapped_column(String(50))
    word_count: Mapped[Optional[int]] = mapped_column(Integer)
    chapter_count: Mapped[Optional[int]] = mapped_column(Integer)
    rating: Mapped[Optional[Rating]] = mapped_column(
        SqlEnum(Rating, name="rating", native_enum=False, create_constraint=False),
        nullable=True,
    )
    category: Mapped[Optional[WorkCategory]] = mapped_column(
        SqlEnum(
            WorkCategory,
            name="workcategory",
            native_enum=False,
            create_constraint=False,
        ),
        nullable=True,
    )
    completion_status: Mapped[Optional[str]] = mapped_column(String(50))
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
    files: Mapped[list["WorkFile"]] = relationship(
        back_populates="work", cascade="all, delete-orphan"
    )
    tags: Mapped[list["Tag"]] = relationship(
        secondary=work_tags, back_populates="works"
    )
    warnings: Mapped[list[ArchiveWarning]] = relationship(
        secondary=work_warnings, back_populates="works"
    )
