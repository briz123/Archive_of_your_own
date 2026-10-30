from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


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
    created_at: datetime
    files: list[WorkFileRead]
