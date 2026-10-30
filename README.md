# Archive of Your Own (AYO)

AYO is a searchable archive for downloadable fanfiction. The project currently
has a React frontend, a FastAPI backend, and a local PostgreSQL database for
work metadata. EPUB uploads preserve the original file and store extracted
metadata. Authentication and public download links are not implemented yet.

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
Alembic creates and updates the database schema from versioned migration files.
From `Archive_of_your_own/backend`, with the virtual environment activated:

```bash
alembic upgrade head
```

The backend exposes `GET /api/works` and `GET /api/works/{id}` to retrieve
stored work metadata, and `POST /api/works/upload` to add an EPUB. The health
check (`GET /api/health`) also checks the database connection.

Uploads are streamed into the private `backend/uploads` directory, validated
as EPUB ZIP archives, and stored under generated UUID filenames. The default
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
page should display “Connected to the AYO backend.” You can also open
`http://localhost:5173/api/health` to see the JSON response directly.

With the backend running, upload a real EPUB from the repository root using:

```bash
curl -F "file=@/path/to/book.epub" http://localhost:8000/api/works/upload
```

The response contains the extracted work metadata and file record. The
original EPUB is saved under `backend/uploads` with its original filename
recorded in PostgreSQL.

## Test

From `Archive_of_your_own/backend`, with the virtual environment activated:

```bash
pytest
```

The tests insert and retrieve temporary database records and exercise EPUB
metadata extraction, original-file preservation, invalid-upload rejection,
and cleanup after database failure. Ensure PostgreSQL is running and the
migration has been applied before running tests.

From `Archive_of_your_own/frontend`, verify the production bundle builds:

```bash
npm run build
```