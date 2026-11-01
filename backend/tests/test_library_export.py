from datetime import datetime, timezone
from io import BytesIO

from openpyxl import load_workbook

from app.library_export import build_library_workbook
from app.models import (
    ArchiveWarning,
    ArchiveWarningType,
    Tag,
    TagType,
    Work,
    WorkCategory,
    WorkFile,
    Rating,
)


GENERATED_AT = datetime(2026, 10, 31, 12, 34, tzinfo=timezone.utc)


def make_work(
    work_id: int,
    title: str,
    fandoms: tuple[str, ...] = (),
    tags: tuple[tuple[str, TagType], ...] = (),
    **overrides,
) -> Work:
    values = {
        "original_author": "Author",
        "description": "A work summary.",
        "language": "en",
        "publisher": "Publisher",
        "identifier": "urn:test:work",
        "subject": "Subject",
        "creator": "Creator",
        "producer": "Producer",
        "publication_date": "2020",
        "creation_date": "2021",
        "modification_date": "2022",
        "word_count": 1200,
        "chapter_count": 3,
        "rating": Rating.TEEN_AND_UP_AUDIENCES,
        "category": WorkCategory.GEN,
        "completion_status": "Complete",
        "published_at": datetime(2020, 1, 2, tzinfo=timezone.utc),
        "created_at": datetime(2026, 10, 30, 3, 4, tzinfo=timezone.utc),
        "updated_at": datetime(2026, 10, 31, 3, 4, tzinfo=timezone.utc),
    }
    values.update(overrides)
    work = Work(
        id=work_id,
        user_id=7,
        title=title,
        warnings=values.pop(
            "warnings",
            [ArchiveWarning(name=ArchiveWarningType.NO_ARCHIVE_WARNINGS_APPLY)],
        ),
        files=values.pop(
            "files",
            [
                WorkFile(
                    original_filename="story.epub",
                    file_format="EPUB",
                    file_size=2048,
                )
            ],
        ),
        tags=[
            Tag(user_id=7, name=name, tag_type=tag_type)
            for name, tag_type in (
                *((name, TagType.FANDOM) for name in fandoms),
                *tags,
            )
        ],
        **values,
    )
    return work


def load_export(works):
    return load_workbook(BytesIO(build_library_workbook(works, GENERATED_AT)))


def test_empty_library_has_exactly_three_filterable_data_sheets() -> None:
    workbook = load_export([])

    assert workbook.sheetnames == ["Read Me", "All Works", "Tags"]
    assert workbook["All Works"].max_row == 1
    assert workbook["Tags"].max_row == 1
    assert workbook["All Works"].auto_filter.ref == "A1:AE1"
    assert workbook["Tags"].auto_filter.ref == "A1:D1"
    assert workbook["All Works"].freeze_panes == "A2"
    assert workbook["Tags"].freeze_panes == "A2"
    assert workbook.active.title == "Read Me"
    assert workbook["All Works"]["A1"].fill.fgColor.rgb == "FF4B1022"
    assert workbook["All Works"]["A1"].font.color.rgb == "FFFFFFFF"
    assert workbook["All Works"].sheet_properties.tabColor.rgb == "FF78233A"
    assert workbook["Tags"].sheet_properties.tabColor.rgb == "FF96384C"
    assert workbook["Read Me"]["B3"].value == "My Personal Library"
    assert workbook["Read Me"]["B3"].font.color.rgb == "FF4B1022"
    assert workbook["Read Me"]["B7"].fill.fgColor.rgb == "FFF4E9E6"
    assert workbook["Read Me"]["D7"].fill.fgColor.rgb == "FFF8F0EC"
    assert workbook["Read Me"]["F7"].fill.fgColor.rgb == "FFEADCE3"
    assert workbook["Read Me"]["B8"].value == 0
    assert workbook["Read Me"]["D8"].value == 0
    assert workbook["Read Me"]["F8"].value == 0
    assert "October 31, 2026" in workbook["Read Me"]["B5"].value
    assert workbook["Read Me"]["B20"].value == "Work ID"
    assert workbook["Read Me"]["B54"].value == "Work ID"


def test_groups_works_once_by_actual_fandom_tag_relationships() -> None:
    works = [
        make_work(
            1,
            "Zebra",
            ("Zeta",),
            subject="Alpha, Zeta",
        ),
        make_work(
            2,
            "Éclair",
            ("Zeta", "Alpha"),
            subject="No crossover here",
        ),
        make_work(3, "Alpha", ("Alpha",)),
        make_work(4, "No Fandom"),
        make_work(5, "Another Crossover", ("Zeta", "Alpha")),
    ]
    sheet = load_export(works)["All Works"]
    work_ids = []
    titles_by_group = {}
    group_counts = {}
    group_order = []

    for row in sheet.iter_rows(min_row=2, values_only=True):
        work_ids.append(row[0])
        group_name = row[1]
        if group_name not in titles_by_group:
            group_order.append(group_name)
            titles_by_group[group_name] = []
            group_counts[group_name] = row[2]
        titles_by_group[group_name].append(row[3])

    assert sheet.max_row == len(works) + 1
    assert group_order == [
        "Alpha",
        "Zeta",
        "Crossover",
        "Uncategorized",
    ]
    assert group_counts == {"Alpha": 1, "Zeta": 1, "Crossover": 2, "Uncategorized": 1}
    assert titles_by_group["Alpha"] == ["Alpha"]
    assert titles_by_group["Zeta"] == ["Zebra"]
    assert titles_by_group["Crossover"] == ["Another Crossover", "Éclair"]
    assert sorted(work_ids) == [1, 2, 3, 4, 5]
    assert sheet["B2"].fill.fgColor.rgb == "FFF4E9E6"
    assert sheet["C2"].value == 1
    assert sheet["B4"].fill.fgColor.rgb == "FF4B1022"
    assert sheet["B6"].fill.fgColor.rgb == "FFEADCE3"


def test_exports_metadata_tags_unicode_and_styles_without_book_contents() -> None:
    long_title = f"夏の物語 — {'A' * 520}"
    long_summary = f"Résumé — {'étoile & friends. ' * 120}"
    work = make_work(
        11,
        long_title,
        ("Fandom 1", "Fandom 2"),
        (
            ("Zoë", TagType.CHARACTER),
            ("Friends & Lovers", TagType.RELATIONSHIP),
            ("絆", TagType.ADDITIONAL),
        ),
        description=long_summary,
        files=[
            WorkFile(
                original_filename="例 — story.epub",
                file_format="EPUB",
                file_size=9876,
            )
        ],
    )
    workbook = load_export([work])
    all_works = workbook["All Works"]
    tags = workbook["Tags"]
    work_row = next(
        row for row in all_works.iter_rows(min_row=2) if row[0].value == work.id
    )
    tag_rows = list(tags.iter_rows(min_row=2, values_only=True))
    headers = [cell.value for cell in all_works[1]]

    assert workbook.sheetnames == ["Read Me", "All Works", "Tags"]
    assert all_works.cell(work_row[0].row, headers.index("Work title") + 1).value == long_title
    assert all_works.cell(work_row[0].row, headers.index("Summary") + 1).value == long_summary
    assert all_works.cell(work_row[0].row, headers.index("Summary") + 1).alignment.wrap_text
    assert all_works.cell(work_row[0].row, headers.index("Work title") + 1).font.name == "Georgia"
    assert all_works.cell(work_row[0].row, headers.index("Fandoms") + 1).value == (
        "Fandom 1; Fandom 2"
    )
    assert all_works.cell(work_row[0].row, headers.index("Date added") + 1).number_format == (
        "yyyy-mm-dd hh:mm"
    )
    assert all_works.column_dimensions["F"].width == 60
    assert all_works.auto_filter.ref.endswith(f"{all_works.max_row}")
    assert [row[2:] for row in tag_rows] == [
        ("Fandom 1", "fandom"),
        ("Fandom 2", "fandom"),
        ("Zoë", "character"),
        ("Friends & Lovers", "relationship"),
        ("絆", "additional"),
    ]
    assert [tags.cell(row, 4).fill.fgColor.rgb for row in range(2, 7)] == [
        "FFF4E9E6",
        "FFF4E9E6",
        "FFEADCE3",
        "FFF0DDE1",
        "FFF8F0EC",
    ]
    assert workbook["Read Me"]["B8"].value == 1
    assert workbook["Read Me"]["D8"].value == 2
    assert workbook["Read Me"]["F8"].value == 1
    assert "Favorites" not in workbook.sheetnames
    assert "Collections" not in workbook.sheetnames
    assert not any(
        "favorite" in str(header).lower()
        or "collection" in str(header).lower()
        or "password" in str(header).lower()
        for header in headers
    )
