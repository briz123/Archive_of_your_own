from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models import ArchiveWarning, ArchiveWarningType, Rating, TagType, WorkCategory


class TagAliasRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    alias_name: str


class TagRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    tag_type: TagType
    is_canonical: bool
    aliases: list[TagAliasRead]


class TagInput(BaseModel):
    name: str = Field(min_length=1, max_length=300)
    tag_type: TagType

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Tag names cannot be blank.")
        return normalized


class WorkUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=500)
    original_author: Optional[str] = Field(default=None, max_length=500)
    description: Optional[str] = None
    language: Optional[str] = Field(default=None, max_length=50)
    word_count: Optional[int] = Field(default=None, ge=0)
    chapter_count: Optional[int] = Field(default=None, ge=0)
    rating: Optional[Rating] = None
    category: Optional[WorkCategory] = None
    completion_status: Optional[str] = Field(default=None, max_length=50)
    published_at: Optional[datetime] = None
    tags: Optional[list[TagInput]] = None
    warnings: Optional[list[ArchiveWarningType]] = None

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: Optional[str]) -> Optional[str]:
        if value is None or not value.strip():
            raise ValueError("Work titles cannot be blank.")
        return value.strip()


class WorkFileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    original_filename: str
    file_format: str
    file_size: int
    checksum: Optional[str]
    created_at: datetime


class WorkRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    original_author: Optional[str]
    description: Optional[str]
    language: Optional[str]
    word_count: Optional[int]
    chapter_count: Optional[int]
    rating: Optional[Rating]
    category: Optional[WorkCategory]
    completion_status: Optional[str]
    published_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    files: list[WorkFileRead]
    tags: list[TagRead]
    warnings: list[ArchiveWarningType]

    @field_validator("warnings", mode="before")
    @classmethod
    def serialize_warnings(cls, value: object) -> object:
        if isinstance(value, list):
            return [
                warning.name if isinstance(warning, ArchiveWarning) else warning
                for warning in value
            ]
        return value
