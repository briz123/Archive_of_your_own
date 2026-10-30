from fastapi import FastAPI

app = FastAPI(title="Archive of Your Own")


@app.get("/api/health")
def health_check() -> dict[str, str]:
    return {"status": "ok", "message": "Connected to the AYO backend."}
