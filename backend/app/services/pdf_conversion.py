import html
import re
from pathlib import Path
from typing import Optional

from ebooklib import epub
from pypdf import PdfReader
from pypdf.errors import PdfReadError, PdfStreamError


class InvalidPDFError(ValueError):
    pass


MAX_PDF_PAGES = 10_000
MAX_EXTRACTED_TEXT_BYTES = 100 * 1024 * 1024


def _metadata_text(value: object) -> Optional[str]:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized or None


def _paragraphs(page_texts: list[str]) -> list[str]:
    paragraphs: list[str] = []
    for page_text in page_texts:
        for paragraph in re.split(r"\n\s*\n", page_text.strip()):
            normalized = re.sub(r"\s+", " ", paragraph).strip()
            if normalized:
                paragraphs.append(normalized)
    return paragraphs


def convert_pdf_to_epub(path: Path, original_filename: str) -> Path:
    if Path(original_filename).suffix.lower() != ".pdf":
        raise InvalidPDFError("Only .pdf files can be converted as PDFs.")

    try:
        reader = PdfReader(str(path), strict=False)
        if reader.is_encrypted:
            raise InvalidPDFError("Password-protected PDF files are not supported.")
        if len(reader.pages) == 0:
            raise InvalidPDFError("The PDF does not contain any pages.")
        if len(reader.pages) > MAX_PDF_PAGES:
            raise InvalidPDFError("The PDF contains too many pages to convert.")

        page_texts: list[str] = []
        extracted_size = 0
        for page in reader.pages:
            text = page.extract_text() or ""
            extracted_size += len(text.encode("utf-8"))
            if extracted_size > MAX_EXTRACTED_TEXT_BYTES:
                raise InvalidPDFError("The PDF contains too much text to convert.")
            page_texts.append(text)
    except InvalidPDFError:
        raise
    except (OSError, PdfReadError, PdfStreamError, ValueError) as error:
        raise InvalidPDFError("The uploaded file is not a valid, readable PDF.") from error

    paragraphs = _paragraphs(page_texts)
    if not paragraphs:
        raise InvalidPDFError(
            "The PDF has no extractable text. Scanned PDFs are not supported yet."
        )

    metadata = reader.metadata
    title = _metadata_text(metadata.title if metadata else None) or Path(
        original_filename
    ).stem
    author = _metadata_text(metadata.author if metadata else None)

    book = epub.EpubBook()
    book.set_identifier(f"pdf-conversion-{path.stem}")
    book.set_title(title)
    if author:
        book.add_author(author)

    body = "".join(f"<p>{html.escape(paragraph)}</p>" for paragraph in paragraphs)
    chapter = epub.EpubHtml(
        title=title,
        file_name="content.xhtml",
        lang="en",
    )
    chapter.set_content(
        (
            '<html xmlns="http://www.w3.org/1999/xhtml" lang="en">'
            f"<head><title>{html.escape(title)}</title></head>"
            f"<body>{body}</body></html>"
        ).encode("utf-8")
    )
    book.add_item(chapter)
    book.add_item(epub.EpubNcx())
    book.add_item(epub.EpubNav())
    book.spine = ["nav", chapter]

    output_path = path.with_suffix(".epub")
    try:
        epub.write_epub(str(output_path), book)
    except (OSError, ValueError, epub.EpubException) as error:
        output_path.unlink(missing_ok=True)
        raise InvalidPDFError("Could not convert the PDF to an EPUB.") from error
    return output_path
