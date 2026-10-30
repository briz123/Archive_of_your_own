from datetime import datetime
from enum import Enum
from pathlib import PurePath
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.config import ADVANCED_SEARCH_ENABLED
from app.models import (
    ArchiveWarning,
    ArchiveWarningType,
    Rating,
    Tag,
    TagAlias,
    TagType,
    Work,
    WorkFile,
    WorkCategory,
)
from app.api.auth import CurrentUser
from app.schemas.work import TagInput, WorkImport, WorkRead, WorkUpdate

router = APIRouter(prefix="/api/works", tags=["works"])


class WorkSort(str, Enum):
    RECENTLY_UPDATED = "recently_updated"
    RECENTLY_ADDED = "recently_added"
    OLDEST_ADDED = "oldest_added"
    TITLE = "title"
    WORD_COUNT_DESC = "word_count_desc"
    WORD_COUNT_ASC = "word_count_asc"


class FandomOption(BaseModel):
    id: int
    name: str


class TagOption(BaseModel):
    id: int
    name: str
    tag_type: str
    is_canonical: bool
    aliases: list[str]


class FilterOptions(BaseModel):
    advanced_search_enabled: bool
    fandoms: list[FandomOption]
    tags: list[TagOption]
    ratings: list[str]
    categories: list[str]
    warnings: list[str]
    completion_statuses: list[str]
    languages: list[str]


def _work_options():
    return (
        selectinload(Work.files),
        selectinload(Work.tags).selectinload(Tag.aliases),
        selectinload(Work.warnings),
    )


def _tag_search_condition(term: str):
    matching_alias = (
        select(TagAlias.id)
        .where(
            TagAlias.canonical_tag_id == Tag.id,
            TagAlias.alias_name.icontains(term, autoescape=True),
        )
        .exists()
    )
    return or_(
        Tag.name.icontains(term, autoescape=True),
        matching_alias,
    )


@router.get("", response_model=list[WorkRead])
def list_works(
    user: CurrentUser,
    search: Optional[str] = Query(default=None, max_length=200),
    fandom_id: Optional[list[int]] = Query(default=None),
    tag_id: Optional[list[int]] = Query(default=None),
    exclude_tag_id: Optional[list[int]] = Query(default=None),
    relationship_id: Optional[list[int]] = Query(default=None),
    character_id: Optional[list[int]] = Query(default=None),
    additional_tag_id: Optional[list[int]] = Query(default=None),
    include_tag_id: Optional[list[int]] = Query(default=None),
    tag_type: Optional[list[TagType]] = Query(default=None),
    rating: Optional[list[Rating]] = Query(default=None),
    category: Optional[list[WorkCategory]] = Query(default=None),
    warning: Optional[list[ArchiveWarningType]] = Query(default=None),
    exclude_warning: Optional[list[ArchiveWarningType]] = Query(default=None),
    completion_status: Optional[list[str]] = Query(default=None),
    language: Optional[list[str]] = Query(default=None),
    sort: WorkSort = Query(default=WorkSort.RECENTLY_ADDED),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> list[Work]:
    advanced_filters = (
        tag_id,
        exclude_tag_id,
        relationship_id,
        character_id,
        additional_tag_id,
        include_tag_id,
        tag_type,
        rating,
        category,
        warning,
        exclude_warning,
        completion_status,
        language,
    )
    if not ADVANCED_SEARCH_ENABLED and (
        any(advanced_filters) or sort != WorkSort.RECENTLY_ADDED
    ):
        raise HTTPException(
            status_code=403,
            detail="Advanced search is not enabled.",
        )

    statement = select(Work).options(*_work_options()).where(Work.user_id == user.id)
    if search and search.strip():
        term = search.strip()
        search_conditions = [
            Work.title.icontains(term, autoescape=True),
            Work.original_author.icontains(term, autoescape=True),
        ]
        if ADVANCED_SEARCH_ENABLED:
            matching_tag_ids = select(Tag.id).where(_tag_search_condition(term))
            matching_alias_tag_ids = (
                select(TagAlias.canonical_tag_id)
                .where(TagAlias.alias_name.icontains(term, autoescape=True))
            )
            matching_ids = matching_tag_ids.union(matching_alias_tag_ids)
            search_conditions.extend(
                [
                    Work.description.icontains(term, autoescape=True),
                    Work.tags.any(Tag.id.in_(matching_ids)),
                ]
            )
        statement = statement.where(or_(*search_conditions))

    if fandom_id:
        statement = statement.where(
            Work.tags.any(
                and_(
                    Tag.tag_type == TagType.FANDOM,
                    Tag.id.in_(set(fandom_id)),
                )
            )
        )
    if tag_id:
        statement = statement.where(Work.tags.any(Tag.id.in_(set(tag_id))))
    if exclude_tag_id:
        statement = statement.where(~Work.tags.any(Tag.id.in_(set(exclude_tag_id))))
    for selected_ids, selected_type in (
        (relationship_id, TagType.RELATIONSHIP),
        (character_id, TagType.CHARACTER),
        (additional_tag_id, TagType.ADDITIONAL),
    ):
        if selected_ids:
            statement = statement.where(
                Work.tags.any(
                    and_(
                        Tag.tag_type == selected_type,
                        Tag.id.in_(set(selected_ids)),
                    )
                )
            )
    if include_tag_id:
        statement = statement.where(
            Work.tags.any(Tag.id.in_(set(include_tag_id)))
        )
    if tag_type:
        for selected_type in set(tag_type):
            statement = statement.where(
                Work.tags.any(Tag.tag_type == selected_type)
            )
    if rating:
        statement = statement.where(Work.rating.in_(set(rating)))
    if category:
        statement = statement.where(Work.category.in_(set(category)))
    if warning:
        statement = statement.where(
            Work.warnings.any(ArchiveWarning.name.in_(set(warning)))
        )
    if exclude_warning:
        statement = statement.where(
            ~Work.warnings.any(ArchiveWarning.name.in_(set(exclude_warning)))
        )
    if completion_status:
        statement = statement.where(Work.completion_status.in_(set(completion_status)))
    if language:
        statement = statement.where(Work.language.in_(set(language)))

    if sort == WorkSort.RECENTLY_UPDATED:
        statement = statement.order_by(Work.updated_at.desc(), Work.id.desc())
    elif sort == WorkSort.RECENTLY_ADDED:
        statement = statement.order_by(Work.created_at.desc(), Work.id.desc())
    elif sort == WorkSort.OLDEST_ADDED:
        statement = statement.order_by(Work.created_at, Work.id)
    elif sort == WorkSort.TITLE:
        statement = statement.order_by(func.lower(Work.title), Work.id)
    elif sort == WorkSort.WORD_COUNT_ASC:
        statement = statement.order_by(
            Work.word_count.asc().nulls_last(), Work.id
        )
    else:
        statement = statement.order_by(
            Work.word_count.desc().nulls_last(), Work.id.desc()
        )

    return list(
        db.scalars(statement.offset((page - 1) * page_size).limit(page_size)).all()
    )


@router.get("/filters")
def get_filter_options(
    user: CurrentUser,
    db: Session = Depends(get_db),
) -> FilterOptions:
    tags = db.scalars(
        select(Tag)
        .where(Tag.user_id == user.id)
        .where(Tag.works.any(Work.user_id == user.id))
        .options(selectinload(Tag.aliases))
        .order_by(Tag.tag_type, func.lower(Tag.name))
    ).all()
    ratings = db.scalars(
        select(Work.rating)
        .where(Work.user_id == user.id)
        .where(Work.rating.is_not(None))
        .distinct()
        .order_by(Work.rating)
    ).all()
    categories = db.scalars(
        select(Work.category)
        .where(Work.user_id == user.id)
        .where(Work.category.is_not(None))
        .distinct()
        .order_by(Work.category)
    ).all()
    warnings = db.scalars(select(ArchiveWarning).order_by(ArchiveWarning.name)).all()
    completion_statuses = db.scalars(
        select(Work.completion_status)
        .where(Work.user_id == user.id)
        .where(Work.completion_status.is_not(None))
        .distinct()
        .order_by(Work.completion_status)
    ).all()
    languages = db.scalars(
        select(Work.language)
        .where(Work.user_id == user.id)
        .where(Work.language.is_not(None))
        .distinct()
        .order_by(Work.language)
    ).all()

    return {
        "advanced_search_enabled": ADVANCED_SEARCH_ENABLED,
        "fandoms": [
            {"id": tag.id, "name": tag.name}
            for tag in tags
            if tag.tag_type == TagType.FANDOM
        ],
        "tags": [
            {
                "id": tag.id,
                "name": tag.name,
                "tag_type": tag.tag_type.value,
                "is_canonical": tag.is_canonical,
                "aliases": [alias.alias_name for alias in tag.aliases],
            }
            for tag in tags
        ],
        "ratings": [rating.value for rating in ratings],
        "categories": [category.value for category in categories],
        "warnings": [warning.name.value for warning in warnings],
        "completion_statuses": list(completion_statuses),
        "languages": list(languages),
    }


@router.get("/{work_id}", response_model=WorkRead)
def get_work(
    work_id: int,
    user: CurrentUser,
    db: Session = Depends(get_db),
) -> Work:
    statement = (
        select(Work)
        .options(*_work_options())
        .where(Work.id == work_id, Work.user_id == user.id)
    )
    work = db.scalar(statement)
    if work is None:
        raise HTTPException(status_code=404, detail="Work not found")
    return work


def _get_or_create_tag(db: Session, user_id: int, tag_input: TagInput) -> Tag:
    tag = db.scalar(
        select(Tag).where(
            Tag.user_id == user_id,
            func.lower(Tag.name) == tag_input.name.lower(),
            Tag.tag_type == tag_input.tag_type,
        )
    )
    if tag is not None:
        return tag

    alias = db.scalar(
        select(TagAlias)
        .options(selectinload(TagAlias.canonical_tag))
        .where(
            func.lower(TagAlias.alias_name) == tag_input.name.lower(),
            TagAlias.canonical_tag.has(Tag.user_id == user_id),
        )
    )
    if alias is not None:
        if alias.canonical_tag.tag_type != tag_input.tag_type:
            raise HTTPException(
                status_code=422,
                detail="This alias belongs to a tag with a different type.",
            )
        return alias.canonical_tag

    tag = Tag(
        user_id=user_id,
        name=tag_input.name,
        tag_type=tag_input.tag_type,
    )
    db.add(tag)
    db.flush()
    return tag


@router.post("", response_model=WorkRead, status_code=status.HTTP_201_CREATED)
def import_work(
    body: WorkImport,
    user: CurrentUser,
    db: Session = Depends(get_db),
) -> Work:
    filename = body.file.original_filename
    title = body.title or PurePath(filename).stem or filename
    publication_datetime = None
    if body.publication_date:
        try:
            publication_datetime = datetime.fromisoformat(
                body.publication_date.replace("Z", "+00:00")
            )
        except ValueError:
            pass

    work = Work(
        user_id=user.id,
        title=title,
        original_author=body.original_author,
        description=body.description,
        language=body.language,
        publisher=body.publisher,
        identifier=body.identifier,
        subject=body.subject,
        creator=body.creator,
        producer=body.producer,
        publication_date=body.publication_date,
        creation_date=body.creation_date,
        modification_date=body.modification_date,
        published_at=publication_datetime,
        rating=body.rating,
        category=body.category,
    )
    db.add(work)
    db.flush()

    unique_tags = {
        (tag.tag_type, tag.name.casefold()): tag for tag in body.tags
    }
    work.tags = [
        _get_or_create_tag(db, user.id, tag) for tag in unique_tags.values()
    ]
    if body.warnings:
        work.warnings = list(
            db.scalars(
                select(ArchiveWarning).where(
                    ArchiveWarning.name.in_(set(body.warnings))
                )
            ).all()
        )
    work.files.append(
        WorkFile(
            original_filename=filename,
            storage_filename=None,
            file_format=body.file.file_format,
            file_size=body.file.file_size,
            checksum=body.file.checksum.lower(),
            storage_provider="local",
            status="cataloged",
        )
    )

    db.commit()
    return get_work(work.id, user, db)


@router.put("/{work_id}", response_model=WorkRead)
def update_work(
    work_id: int,
    changes: WorkUpdate,
    user: CurrentUser,
    db: Session = Depends(get_db),
) -> Work:
    statement = (
        select(Work)
        .options(*_work_options())
        .where(Work.id == work_id, Work.user_id == user.id)
    )
    work = db.scalar(statement)
    if work is None:
        raise HTTPException(status_code=404, detail="Work not found")

    updates = changes.model_dump(exclude_unset=True)
    tag_inputs = changes.tags if "tags" in updates else None
    updates.pop("tags", None)
    warnings = updates.pop("warnings", None)
    for field, value in updates.items():
        setattr(work, field, value)

    if tag_inputs is not None:
        work.tags = [
            _get_or_create_tag(db, user.id, tag) for tag in tag_inputs
        ]
    if warnings is not None:
        warning_names = set(warnings)
        work.warnings = list(
            db.scalars(
                select(ArchiveWarning).where(ArchiveWarning.name.in_(warning_names))
            ).all()
        )

    db.commit()
    return get_work(work_id, user, db)
