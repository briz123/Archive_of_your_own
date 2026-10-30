# Archive of Your Own (AYO)

AYO is a searchable archive for downloadable fanfiction. This first milestone
sets up a React frontend and a FastAPI backend and verifies that they can
communicate. It intentionally does not include a database, uploads, or
authentication yet.

## Requirements

- Python 3.9 or newer
- Node.js and npm`

Check that they are installed:

```bash
python3 --version
node --version
npm --version
```

## Install dependencies

Run these commands from the repository root (`Archive_of_your_own`):

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r backend/requirements.txt
cd frontend
npm install
```

The virtual environment keeps Python packages for this project separate from
other Python projects. Vite serves the React development site and forwards its
`/api` requests to FastAPI, so the browser can call the backend without adding
cross-origin configuration.

## Run locally

Open two terminals in the repository root. Activate the Python environment in
the backend terminal, then start the services:

**Terminal 1 — backend** (from `Archive_of_your_own/backend`):

```bash
cd backend
source ../.venv/bin/activate
uvicorn app.main:app --reload
```

**Terminal 2 — frontend** (from `Archive_of_your_own/frontend`):

```bash
cd frontend
npm run dev
```

Open the frontend URL printed by Vite (normally `http://localhost:5173`). The
page should display “Connected to the AYO backend.” You can also open
`http://localhost:5173/api/health` to see the JSON response directly.

## Test

From `Archive_of_your_own/backend`, with the virtual environment activated:

```bash
pytest
```

From `Archive_of_your_own/frontend`, verify the production bundle builds:

```bash
npm run build
```