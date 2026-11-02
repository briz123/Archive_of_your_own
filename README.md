

## Archive of Your Own (AYO)

AYO is a personal fanfiction library for cataloging, organizing, searching, and
managing EPUB and PDF files that readers already have on their own devices.

**Your library lives in AYO. Your books live on your computer.**

AYO's product direction is local-first: import a file to extract and manage its
metadata, while the original book stays on the user's computer. AYO is a personal
organizer, not a public archive or file-sharing service.

I know there has been a lot of discord about the moral implications of author having not consented to redistribution, possible AI usage, etc. This is not that, nothing is being shared and it is truly a personal library where one cannot download fanfiction that they did not previously have access to.

## Beta

AYO has a beta instance on Render, operated on the Hobby plan. It may become inactive after periods of inactivity, and the first visit after that may take time or be unavailable.

My recommendation is to fork and use locally for now.

[https://archive-of-your-own-d7mv.onrender.com/](url)

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

Some/Most of these feature have not yet been implemented.

When cataloging a book, AYO reads the selected file in the browser to extract
and preview its metadata. Nothing is saved until the user chooses to add the
catalog entry. AYO then saves the metadata and a locally calculated fingerprint
for duplicate detection to PostgreSQL. The original book stays on the user's
computer and is never uploaded to AYO's server.

## What AYO is not

AYO is not intended to provide:

- Permanent EPUB or PDF hosting.
- Public fanfiction uploads, sharing, or a public catalog of users' works.
- In-browser reading or file editing.
- Chapter updates or automatic synchronization with publishing platforms.
- Google Drive, Dropbox, or OneDrive integration in the initial release.

Users are responsible for keeping their original files safe. AYO is not a
replacement for a user's own backups.


<img width="1367" height="697" alt="Screenshot 2026-11-01 at 4 38 54 PM" src="https://github.com/user-attachments/assets/3506ccd4-5de1-4e7a-8e95-fb19301c37e0" />

<img width="1367" height="697" alt="Screenshot 2026-11-01 at 4 39 32 PM" src="https://github.com/user-attachments/assets/443e96e6-0b89-4862-bd64-4302e6ded54d" />

<img width="1367" height="697" alt="Screenshot 2026-11-01 at 4 40 08 PM" src="https://github.com/user-attachments/assets/4df21837-fd60-4496-9534-140383afc5b6" />

<img width="1367" height="639" alt="Screenshot 2026-11-01 at 4 38 10 PM" src="https://github.com/user-attachments/assets/f3d6e4e6-c520-453a-bb2f-932ada5edee6" />

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
browser and does not upload the selected file. Saving catalog details creates
a private work record and a local-file record containing metadata about the
file, not its contents. The backend has no server-side book upload or download
routes.

The prototype is experimental and should not be relied upon as the sole catalog
or backup of any work.

## Disclaimer

The project does not guarantee permanent
storage, uninterrupted availability, file integrity, or recovery of library
metadata or user files. Users should maintain their own local backups of their
original books and metadata.

 Users are responsible for understanding and complying with applicable copyright laws and permissions.



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
The backend reads `DATABASE_URL` from `backend/.env`; local `.env` files are ignored by
Git. Edit the URL if your local PostgreSQL username or database differs. 


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
. 

Registration requires a valid email, matching passwords of at least 12 characters, and stores an Argon2 password hash. 



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


## Test

From `Archive_of_your_own/backend`, with the virtual environment activated:

```bash
pytest
```

The tests cover metadata-only work imports, authentication, CSRF validation,
cross-account access, and the absence of server-side file upload/download
routes. Ensure PostgreSQL is running and the migration has been applied before
running tests.

From `Archive_of_your_own/frontend`, verify the production bundle builds:

```bash
npm run build
```
