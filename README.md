## Archive of Your Own (AYO)

AYO is an independent, searchable archive for downloadable fanfiction. It is designed to provide an additional way to preserve and access fanfiction files during temporary outages or periods when original hosting platforms are unavailable.

The project is inspired by the importance of preserving fanfiction and ensuring readers can maintain access to works they value. AYO is intended as a supplementary archive, not a replacement for AO3 or any other original publishing platform.

## Purpose & Intended Use

AYO is designed specifically for downloading fanfiction files and storing them locally on your own device.

Its intended uses include:

- Providing access to downloadable fanfiction during temporary website outages.

- Allowing readers to maintain local copies of works they are authorized to download and keep.

- Preserving access to fanfiction independently of a particular hosting platform.

- Providing a searchable catalog of archived works and their associated metadata.

## What AYO Is Not

AYO is not an online reading platform or a replacement for the communities where fanfiction is originally published.

- No in-browser reading: Works are provided as downloadable files intended to be opened and read on your own device.

- No editing or updating: AYO does not allow users to edit stories, update chapters, or continue works.

- No automatic synchronization: Changes made to a work on its original publishing platform will not automatically appear in AYO.

- No guarantee of the latest version: An archived file represents the version uploaded at that particular time. Visit the original publication for the latest version.

- No community replacement: Comments, bookmarks, author interactions, and other community features remain on the original publishing platforms.

Readers are encouraged to visit and support authors through their original publication pages.

## Copyright & Content Disclaimer

AYO is an independent project. It is not affiliated with, endorsed by, sponsored by, or officially associated with Archive of Our Own (AO3), the Organization for Transformative Works (OTW), or any other fanfiction hosting platform.

Copyright remains with the respective authors and rights holders.

Uploading a work to AYO does not transfer copyright ownership to AYO or to another user.

Users are responsible for ensuring they have the necessary rights, permissions, or other valid legal basis to upload and distribute any work they submit.

In particular:

- Downloading or possessing a copy of a work does not automatically grant permission to redistribute it.

- Users must not upload works they are not authorized to share.

- Authors and other rights holders retain their applicable rights.

- AYO does not claim ownership of uploaded fanfiction, original characters, settings, or other third-party intellectual property.

- The presence of a work in AYO does not imply endorsement or authorization by its original author or rights holder.

Fanfiction may incorporate copyrighted source material. Whether a particular use is legally permitted depends on the circumstances and applicable law. Noncommercial or archival intentions do not automatically establish fair use or other legal permission.

AYO reserves the right to remove content in response to valid copyright complaints or other applicable legal requirements.

## Author Attribution & Respect for Creators

AYO aims to preserve the attribution and original context of fanfiction.

Where available, archived works should retain:

- Original author or pseudonym.

- Original publication URL.

- Work title and description.

- Fandom and relevant tags.

- Original publication or update date.

- Author-provided copyright or distribution notices.

- Users must not remove author attribution, misrepresent authorship, or present another person's work as their own.

- Authors and rights holders may report content they believe infringes their rights or request its removal.

# Project Status

AYO is currently under development.

## The project currently uses:

Frontend: React

Backend: Python and FastAPI

Database: PostgreSQL

ORM: SQLAlchemy

Database migrations: Alembic

Current functionality includes EPUB uploads and PDF uploads converted to EPUB.
Metadata is extracted automatically where available.

Searchable works and fandoms.

AO3-inspired tagging and filtering.

Direct downloads to local devices.

Authentication, public uploads, and public download functionality are still under development.

AYO is experimental software and should not yet be relied upon as the sole backup of any work.

## Disclaimer

AYO is provided on an as-is basis. The project does not guarantee permanent storage, uninterrupted availability, file integrity, or recovery of uploaded content.

Users should maintain their own local backups of files they wish to preserve.

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

The backend exposes `GET /api/works` and `GET /api/works/{id}` to retrieve
stored work metadata, `PUT /api/works/{id}` to edit metadata without changing
the stored file, `POST /api/works/upload` to add an EPUB or PDF, and `GET
/api/works/{id}/download` to download its EPUB file without an account. PDF
uploads are converted to EPUB during upload; scanned PDFs without extractable
text are not supported. `POST /api/works/download-bundle` accepts selected work
IDs and returns a ZIP containing their EPUBs and a `metadata.xlsx` spreadsheet
with titles, authors, descriptions, tags, warnings, and other work metadata
(up to 50 works per bundle). The works list accepts an optional `search` query
to match titles and authors without regard to capitalization, for example
`GET /api/works?search=hermione`.
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
Select works using the checkboxes, then choose “Download selected + Excel” to
download their EPUBs and a metadata spreadsheet together in a ZIP file. You can
select up to 50 works per bundle.

## Static preview on GitHub Pages

The GitHub Pages workflow publishes a static demo frontend with sample stories.
The preview supports browsing, title/author search, and fandom filtering.
Uploads, EPUB downloads, and bulk downloads require the Python backend and are
not available in the static preview.

To publish it:

1. Push or merge the workflow to the repository's `main` branch.
2. In GitHub, open **Settings → Pages** and set the build and deployment source
   to **GitHub Actions**.
3. Open the **Actions** tab and wait for **Deploy static demo to GitHub Pages**
   to finish.

The site will be available at
`https://briz123.github.io/Archive_of_your_own/`. Subsequent pushes to `main`
deploy it automatically. The live, fully functional app still needs a separately
hosted backend and database.

With the backend running, upload an EPUB or a text-based PDF from the repository
root using:

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
cleanup after database failure. Download tests cover multi-work ZIP bundles and
the generated Excel metadata sheet. Ensure PostgreSQL is running and the
migration has been applied before running tests.

From `Archive_of_your_own/frontend`, verify the production bundle builds:

```bash
npm run build
```