import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import vehicles, chat, reports, alerts, admin, auth
from app.sync_job import start_scheduler
from app.auth import seed_admin, security_startup_warnings

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Schema is managed by Alembic — run `alembic upgrade head` to create/upgrade
    # tables (on a fresh DB, do this before first start).
    seed_admin()
    security_startup_warnings()
    start_scheduler()
    yield


app = FastAPI(title="Fleet AI Dashboard API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(vehicles.router)
app.include_router(chat.router)
app.include_router(reports.router)
app.include_router(alerts.router)
app.include_router(admin.router)


@app.get("/health")
def health():
    return {"status": "ok"}
