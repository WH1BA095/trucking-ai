import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import Base, engine
from app.routers import vehicles, chat, reports, alerts, admin, auth
from app.sync_job import start_scheduler
from app.auth import seed_admin

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Fleet AI Dashboard API")

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


@app.on_event("startup")
def on_startup():
    # Creates tables if they don't exist yet. Fine for early development;
    # switch to Alembic migrations before this touches a shared/production DB.
    Base.metadata.create_all(bind=engine)
    seed_admin()
    start_scheduler()


@app.get("/health")
def health():
    return {"status": "ok"}
