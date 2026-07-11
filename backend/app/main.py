import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.routers import vehicles, chat, reports, alerts, admin, auth, system
from app.sync_job import start_scheduler
from app.auth import seed_admin, security_startup_warnings
from app.selftest import record_exception

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("main")


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
app.include_router(system.router)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Catch-all for unhandled errors — record them in the system journal.

    Intentional HTTPExceptions have their own handler and never reach here, so
    this only fires on genuine bugs/outages, which are exactly what the owner's
    health journal should surface (kind="runtime_error").
    """
    record_exception(f"{request.method} {request.url.path}", exc)
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.get("/health")
def health():
    return {"status": "ok"}
