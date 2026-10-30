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

Accounts, private work/tag ownership, and browser-side metadata import are
implemented. File relinking, collections, favorites, and duplicate detection
are not. Saving an import stores metadata and a SHA-256 fingerprint only; the
selected file is not sent to the backend.

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
PostgreSQL, SQLAlchemy, and Alembic. Email/password accounts and owner-scoped
library APIs are implemented. EPUB and PDF metadata extraction now runs in the
browser and does not upload the selected file. Saving an import creates a
private work record and local-file metadata record. Legacy backend upload
routes still exist for older server-stored files but are not used by the
current frontend import form.

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

## Browser metadata extraction

The reusable extractor is in `frontend/src/services/metadata/`. It returns
the same nullable metadata shape for EPUB and PDF files. EPUB parsing uses
`fflate` to read only the package metadata and optional cover image from the
archive; PDF properties are read using Mozilla PDF.js. Both operate on the
selected file bytes in the browser. The import form previews the fields and
tags, then posts only metadata and a locally computed SHA-256 fingerprint.

Supported EPUB fields include title, author, description, language, publisher,
publication date, identifier, cover, subject-derived fandom/character/
relationship/additional tags, rating, category, and archive warnings. PDF
fields include title, author, subject, creator, producer, creation date, and
modification date. Missing values are returned as `null`; metadata extraction
does not assume every file is complete. Input is limited to 100 MiB, EPUB
metadata entries to 2 MiB, cover art to 5 MiB, and archives to 10,000 entries.

Run the frontend metadata tests and production build from `frontend/`:

```bash
npm test
npm run build
```

## Database models and migrations

SQLAlchemy defines users, server-side user sessions, owner-scoped works and
tags, work files, warnings, and taxonomy relationships. Existing works and tags
are assigned to an inactive legacy account by the account migration. Alembic
creates and updates the database schema from versioned migration files.
From `Archive_of_your_own/backend`, with the virtual environment activated:

```bash
alembic upgrade head
```

The following upload/download API instructions describe legacy prototype
routes. The current frontend metadata extractor does not call these endpoints.

Create an account or sign in through the frontend. The backend sets an
HttpOnly, SameSite=Lax session cookie and a separate CSRF cookie; the session
token is stored only as a hash in PostgreSQL. Set `SESSION_COOKIE_SECURE=true`
when serving the app over HTTPS. Configure `TRUSTED_FRONTEND_ORIGINS` for the
frontend origins that are allowed to register or sign in. Registration requires
a valid email, matching passwords of at least 12 characters, and stores an
Argon2 password hash. `POST /api/auth/logout` invalidates the current session.

Library and legacy file routes require a valid session and scope work access to
its owner. `GET /api/health` remains public. The backend exposes `GET /api/works`,
`POST /api/works` to save imported metadata without file contents, and
`GET /api/works/{id}` to retrieve stored work metadata,
`PUT /api/works/{id}` to edit metadata without changing the stored file,
`POST /api/works/upload` to add an EPUB or PDF, and
`GET /api/works/{id}/download` to download its EPUB file. PDF uploads are
converted to EPUB during upload; scanned PDFs without extractable text are not
supported. The
works list accepts an optional `search` query to match titles, authors,
descriptions, tags, and tag aliases without regard to capitalization, for
example `GET /api/works?search=hermione`.
`GET /api/works/filters` returns the available database-backed filter choices.
The library provides filters for fandom, rating, relationship, character,
additional tags, included/excluded archive warnings, included/excluded tags,
completion, and language. The API accepts repeated `fandom_id`, `relationship_id`, `character_id`,
`additional_tag_id`, `include_tag_id`, `tag_id`, `exclude_tag_id`, `warning`,
`exclude_warning`, `rating`, `category`, `tag_type`, `completion_status`, and
`language` parameters. Selections across filter groups combine together;
multiple values within a group match any selected value. Sort values are `recently_added`,
`recently_updated`, `oldest_added`, `title`, `word_count_desc`, and
`word_count_asc`. Filtering and sorting run in PostgreSQL.

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
by title or author, then clear the search to return to your library. Import an
EPUB or PDF from the sidebar; AYO saves its metadata and fingerprint while the
original stays on your computer. New local-file records cannot be downloaded
from AYO because the application does not retain those files. The legacy
`POST /api/works/upload` endpoint still stores files on the server and is not
part of the local-first import flow.

## GitHub Pages

The frontend is deployed to `https://briz123.github.io/Archive_of_your_own/`
by the `Deploy frontend to GitHub Pages` workflow whenever changes reach
`main`. In the repository's **Settings → Pages**, set the build and deployment
source to **GitHub Actions**. The workflow builds the Vite app with the
repository subpath configured for project Pages.

GitHub Pages hosts only static files. Login, saving works, and library search
also require the FastAPI/PostgreSQL backend to be deployed and configured;
they are not provided by GitHub Pages itself.

## Test

From `Archive_of_your_own/backend`, with the virtual environment activated:

```bash
pytest
```

The tests insert and retrieve temporary database records and exercise EPUB
metadata extraction, PDF-to-EPUB conversion, invalid-upload rejection, and
cleanup after database failure. Authentication tests cover registration,
login, logout, CSRF validation, and cross-account access. Ensure PostgreSQL is
running and the migration has been applied before running tests.

From `Archive_of_your_own/frontend`, verify the production bundle builds:

```bash
npm run build
```