from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class WorkFile(Base):
    __tablename__ = "work_files"

    id: Mapped[int] = mapped_column(primary_key=True)
    work_id: Mapped[int] = mapped_column(
        ForeignKey("works.id", ondelete="CASCADE"), nullable=False, index=True
    )
    original_filename: Mapped[str] = mapped_column(String(500), nullable=False)
    storage_filename: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True, unique=True
    )
    file_format: Mapped[str] = mapped_column(String(20), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)
    checksum: Mapped[Optional[str]] = mapped_column(String(64))
    storage_provider: Mapped[str] = mapped_column(
        String(50), nullable=False, default="local", server_default="local"
    )
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="stored"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    work: Mapped["Work"] = relationship(back_populates="files")
