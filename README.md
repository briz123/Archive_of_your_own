## Archive of Your Own (AYO)

AYO is a personal fanfiction library for cataloging, organizing, searching, and
managing EPUB and PDF files that readers already have on their own devices.

**Your library lives in AYO. Your books live on your computer.**

AYO's product direction is local-first: import a file to extract and manage its
metadata, while the original book stays on the user's computer. AYO is a personal
organizer, not a public archive or file-sharing service.

## Product vision

AYO aims to provide:

- Personal user accounts and private libraries.
- EPUB and PDF importing with metadata extraction, preferably in the browser.
- A metadata review step before saving a work to the library.
- Editable work information and organization by fandom and tags.
- Personal search and filtering.
- Custom collections, favorites, and duplicate detection.
- File relinking after files are moved or replaced.
- Export of library metadata.

During import, AYO should temporarily read the selected file, extract available
metadata, calculate a fingerprint for duplicate detection, and let the user
review and edit the result. Only the work's metadata should be saved to
PostgreSQL. The original book should remain on the user's computer and should
not be permanently uploaded to AYO's server.

## What AYO is not

AYO is not intended to provide:

- Permanent EPUB or PDF hosting.
- Public fanfiction uploads, sharing, or a public catalog of users' works.
- In-browser reading or file editing.
- Chapter updates or automatic synchronization with publishing platforms.
- Google Drive, Dropbox, or OneDrive integration in the initial release.

Users are responsible for keeping their original files safe. AYO is not a
replacement for a user's own backups.

## Current prototype status

The product vision above is the target, not a description of all working
features. The current prototype does **not** yet have accounts, private
libraries, local-only importing, file relinking, collections, favorites, or
duplicate detection. Its existing importer sends the selected file to the
backend, where the file is stored; the current works list is not private to a
user. Do not import files into this prototype unless you are comfortable with
that behavior. These prototype limitations must be resolved before presenting
it as the local-first product.

## Copyright & Content Disclaimer

AYO is an independent project. It is not affiliated with, endorsed by, sponsored by, or officially associated with Archive of Our Own (AO3), the Organization for Transformative Works (OTW), or any other fanfiction hosting platform.

Copyright remains with the respective authors and rights holders.

Importing a work's metadata into a personal library does not transfer copyright
ownership to AYO or to another user. Users are responsible for respecting
authors' rights and applicable law. AYO is for organizing a user's own files,
not redistributing them.

In particular:

- Possessing a copy of a work does not automatically grant permission to
  redistribute it.

- Authors and other rights holders retain their applicable rights.

- AYO does not claim ownership of fanfiction, original characters, settings, or
  other third-party intellectual property cataloged in a personal library.

Fanfiction may incorporate copyrighted source material. Whether a particular use is legally permitted depends on the circumstances and applicable law. Noncommercial or archival intentions do not automatically establish fair use or other legal permission.

AYO will respond to applicable legal requirements. The intended product does
not publicly host or distribute the original files.

## Author Attribution & Respect for Creators

AYO aims to preserve the attribution and original context of fanfiction in its
metadata.

Where available, imported work metadata should retain:

- Original author or pseudonym.

- Original publication URL.

- Work title and description.

- Fandom and relevant tags.

- Original publication or update date.

- Author-provided copyright or distribution notices.

- Users must not remove author attribution, misrepresent authorship, or present another person's work as their own.

- Authors and rights holders may report content they believe infringes their rights or request its removal.

# Project status

AYO is under development. The current prototype uses React, Python/FastAPI,
PostgreSQL, SQLAlchemy, and Alembic, but its file-upload and shared-catalog
behavior does not yet meet the local-first product vision. Accounts, private
libraries, browser-side file processing, and metadata-only persistence remain
to be implemented.

The prototype is experimental and should not be relied upon as the sole catalog
or backup of any work.

## Disclaimer

AYO is provided on an as-is basis. The project does not guarantee permanent
storage, uninterrupted availability, file integrity, or recovery of library
metadata or user files. Users should maintain their own local backups of their
original books and metadata.

This disclaimer is provided for general informational purposes and does not constitute legal advice. Users are responsible for understanding and complying with applicable copyright laws and permissions.

## Requirements

- Python 3.9 or newer
- Node.js and npm
- PostgreSQL 16 (installed below with Homebrew on macOS)

Check Python and Node.js:

```bash
python3 --version
node --version
npm --version
```

## Install dependencies and PostgreSQL

Run these commands from the repository root (`Archive_of_your_own`). Homebrew
installs PostgreSQL 16 and registers it as a local service:

```bash
brew install postgresql@16
brew services start postgresql@16
createdb ayo_dev
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r backend/requirements.txt
cp backend/.env.example backend/.env
cd frontend
npm install
```

The virtual environment isolates this project's Python packages. The backend
reads `DATABASE_URL` from `backend/.env`; that file is ignored by Git. Edit the
URL if your local PostgreSQL username or database differs. Vite forwards its
`/api` requests to FastAPI for local frontend/backend communication.

## Database models and migrations

SQLAlchemy defines `Work` and `WorkFile`; each work can have multiple files.
Works also have optional word count, chapter count, rating, completion status,
and publication date. Fandoms are shared by works, and shared tags have one of
six categories: Relationship, Character, Additional, Archive Warning, Rating,
or Category. Alembic creates and updates the database schema from versioned
migration files.
From `Archive_of_your_own/backend`, with the virtual environment activated:

```bash
alembic upgrade head
```

The following API and run instructions describe the current prototype, not the
intended local-only import flow. In this prototype, selected book files are
transferred to and stored by the backend.

The backend exposes `GET /api/works` and `GET /api/works/{id}` to retrieve
stored work metadata, `PUT /api/works/{id}` to edit metadata without changing
the stored file, `POST /api/works/upload` to add an EPUB or PDF, and `GET
/api/works/{id}/download` to download its EPUB file without an account. PDF
uploads are converted to EPUB during upload; scanned PDFs without extractable
text are not supported. The
works list accepts an optional `search` query to match titles and authors
without regard to capitalization, for example `GET /api/works?search=hermione`.
`GET /api/works/filters` returns the available database-backed filter choices.
The works list also accepts repeated `fandom_id`, `rating`, `relationship_id`,
`character_id`, `additional_tag_id`, `include_warning_id`,
`exclude_warning_id`, `include_tag_id`, `exclude_tag_id`, `completion_status`,
and `language` parameters, plus a `sort` value. Multiple fandoms and included
tags match any selected value; excluded tags/warnings remove matching works.
Different filter groups combine together. Sort values are `recent`, `oldest`,
`title`, `word_count_desc`, and `word_count_asc`. Filtering and sorting run in
PostgreSQL.

The update endpoint accepts optional scalar metadata fields and optional
`fandoms` and `tags` lists. Supplying a list replaces that work's associations;
omitting it leaves them unchanged. Tag entries have a `name` and one of the
categories listed above. For example:

```json
{
  "word_count": 42000,
  "completion_status": "In Progress",
  "fandoms": ["Harry Potter"],
  "tags": [
    {"name": "Harry Potter/Draco Malfoy", "category": "Relationship"},
    {"name": "Slow Burn", "category": "Additional"}
  ]
}
```

Uploads are streamed into the private `backend/uploads` directory. EPUB uploads
are validated as EPUB ZIP archives; text-based PDFs are converted to EPUB and
the generated EPUB is stored under a UUID filename. The default
maximum upload size is 50 MiB. You can override `MAX_UPLOAD_SIZE_BYTES` and
`UPLOAD_STORAGE_DIR` in `backend/.env`; uploaded files are not served directly
by the frontend.

## Run locally

Open two terminals in the repository root. Activate the Python environment in
the backend terminal, then start the services:

**Terminal 1 — backend** (starting at the repository root):

```bash
cd backend
source ../.venv/bin/activate
uvicorn app.main:app --reload
```

**Terminal 2 — frontend** (starting at the repository root):

```bash
cd frontend
npm run dev
```

Open the frontend URL printed by Vite (normally `http://localhost:5173`). The
homepage lists works saved in PostgreSQL. Use the search field to find a work
by title or author, then clear the search to return to the full archive. Click
“Download EPUB” on a work card to download its EPUB file.

With the backend running, the current prototype accepts an EPUB or text-based
PDF upload from the repository root using:

```bash
curl -F "file=@/path/to/book.pdf" http://localhost:8000/api/works/upload
```

The response contains the extracted work metadata and EPUB file record. PDF
uploads are converted and saved as EPUB under `backend/uploads`; EPUB uploads
are saved unchanged. The uploaded filename is recorded in PostgreSQL.

## Test

From `Archive_of_your_own/backend`, with the virtual environment activated:

```bash
pytest
```

The tests insert and retrieve temporary database records and exercise EPUB
metadata extraction, PDF-to-EPUB conversion, invalid-upload rejection, and
cleanup after database failure. Ensure PostgreSQL is running and the
migration has been applied before running tests.

From `Archive_of_your_own/frontend`, verify the production bundle builds:

```bash
npm run build
```