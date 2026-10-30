from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

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


class LocalFileImport(BaseModel):
    original_filename: str = Field(min_length=1, max_length=500)
    file_format: Literal["EPUB", "PDF"]
    file_size: int = Field(ge=1, le=100 * 1024 * 1024)
    checksum: str = Field(pattern=r"^[0-9a-fA-F]{64}$")
    storage_provider: Literal["local"] = "local"

    @field_validator("original_filename")
    @classmethod
    def keep_filename_only(cls, value: str) -> str:
        filename = value.replace("\\", "/").rsplit("/", maxsplit=1)[-1].strip()
        if not filename:
            raise ValueError("A filename is required.")
        return filename

    @model_validator(mode="after")
    def filename_matches_format(self) -> "LocalFileImport":
        expected_extension = f".{self.file_format.lower()}"
        if not self.original_filename.lower().endswith(expected_extension):
            raise ValueError("The filename extension does not match the file format.")
        return self


class WorkImport(BaseModel):
    title: Optional[str] = Field(default=None, max_length=500)
    original_author: Optional[str] = Field(default=None, max_length=500)
    description: Optional[str] = None
    language: Optional[str] = Field(default=None, max_length=50)
    publisher: Optional[str] = Field(default=None, max_length=500)
    identifier: Optional[str] = Field(default=None, max_length=1000)
    subject: Optional[str] = None
    creator: Optional[str] = Field(default=None, max_length=500)
    producer: Optional[str] = Field(default=None, max_length=500)
    publication_date: Optional[str] = Field(default=None, max_length=100)
    creation_date: Optional[str] = Field(default=None, max_length=100)
    modification_date: Optional[str] = Field(default=None, max_length=100)
    rating: Optional[Rating] = None
    category: Optional[WorkCategory] = None
    tags: list[TagInput] = Field(default_factory=list, max_length=100)
    warnings: list[ArchiveWarningType] = Field(default_factory=list, max_length=6)
    file: LocalFileImport

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class WorkUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=500)
    original_author: Optional[str] = Field(default=None, max_length=500)
    description: Optional[str] = None
    language: Optional[str] = Field(default=None, max_length=50)
    publisher: Optional[str] = Field(default=None, max_length=500)
    identifier: Optional[str] = Field(default=None, max_length=1000)
    subject: Optional[str] = None
    creator: Optional[str] = Field(default=None, max_length=500)
    producer: Optional[str] = Field(default=None, max_length=500)
    publication_date: Optional[str] = Field(default=None, max_length=100)
    creation_date: Optional[str] = Field(default=None, max_length=100)
    modification_date: Optional[str] = Field(default=None, max_length=100)
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
    storage_provider: str
    status: str
    created_at: datetime


class WorkRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    original_author: Optional[str]
    description: Optional[str]
    language: Optional[str]
    publisher: Optional[str]
    identifier: Optional[str]
    subject: Optional[str]
    creator: Optional[str]
    producer: Optional[str]
    publication_date: Optional[str]
    creation_date: Optional[str]
    modification_date: Optional[str]
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
